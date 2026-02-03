use axum::{
    Json, Router,
    extract::{Path, Query, State, ws::WebSocketUpgrade},
    http::{HeaderMap, Method, StatusCode, header},
    response::{IntoResponse, Response, Html},
    routing::{any, get, post, put},
};
use bytes::Bytes;
use object_store::ObjectStoreExt;
use object_store::path::Path as S3Path;
use serde::Deserialize;
use tower_http::{compression::CompressionLayer, cors::CorsLayer};

use crate::{
    config::config,
    courses, db, email,
    multiplayer::{RaceManager, handle_websocket},
    players, race_results, wind_reports,
};

use super::s3;

fn check_editor_password(headers: &HeaderMap) -> Result<(), AppError> {
    let password = &config().editor_password;
    if password.is_empty() {
        return Err(AppError::Unauthorized);
    }
    match headers.get("X-Editor-Password").and_then(|v| v.to_str().ok()) {
        Some(value) if value == password => Ok(()),
        _ => Err(AppError::Unauthorized),
    }
}

// Make our own error that wraps `anyhow::Error`.
enum AppError {
    Internal(anyhow::Error),
    Unauthorized,
}

// Tell axum how to convert `AppError` into a response.
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match self {
            AppError::Internal(err) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Something went wrong: {}", err),
            )
                .into_response(),
            AppError::Unauthorized => StatusCode::UNAUTHORIZED.into_response(),
        }
    }
}

impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(err: E) -> Self {
        Self::Internal(err.into())
    }
}

async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(race_manager): State<RaceManager>,
) -> Response {
    ws.on_upgrade(move |socket| handle_websocket(socket, race_manager))
}

pub async fn run(address: std::net::SocketAddr) {
    let race_manager = RaceManager::new();

    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::HeaderName::from_static("x-editor-password"),
        ]);

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/editor/verify", get(verify_editor_password_handler))
        .route("/courses", get(courses_handler).post(create_course_handler))
        .route(
            "/courses/{key}",
            put(update_course_handler).delete(delete_course_handler),
        )
        .route("/wind/random", get(random_wind_handler))
        .route("/multiplayer/races", get(races_handler))
        .route("/multiplayer/race", any(websocket_handler))
        .route("/leaderboard/{course_key}", get(leaderboard_handler))
        .route("/replay/{result_id}", get(replay_handler))
        // Auth endpoints
        .route("/auth/request-verification", post(request_verification_handler))
        .route("/auth/verify", get(verify_email_handler))
        .route("/auth/me", get(auth_me_handler))
        .layer(CompressionLayer::new())
        .layer(cors)
        .with_state(race_manager);

    let listener = tokio::net::TcpListener::bind(address).await.unwrap();
    log::info!("Server listening on {}", address);
    axum::serve(listener, app).await.unwrap();
}

async fn health_handler() -> Result<String, AppError> {
    // Check GRIB bucket write access
    let s3 = s3::grib_client();
    let health_path = S3Path::from("/healthcheck");
    s3.put(&health_path, Bytes::new().into()).await?;

    // Check database is readable
    let report_count = wind_reports::get_report_count()?;

    Ok(format!("OK ({} wind reports)", report_count))
}

async fn verify_editor_password_handler(
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    check_editor_password(&headers)?;
    Ok(StatusCode::OK)
}

async fn courses_handler() -> Result<impl IntoResponse, AppError> {
    let courses = db::with_connection(|conn| courses::get_all(conn))?;
    Ok(Json(courses))
}

async fn create_course_handler(
    headers: HeaderMap,
    Json(course): Json<courses::Course>,
) -> Result<impl IntoResponse, AppError> {
    check_editor_password(&headers)?;
    log::info!("Course created: {} ({})", course.name, course.key);
    db::with_connection(|conn| courses::insert(conn, &course))?;
    Ok(StatusCode::CREATED)
}

async fn update_course_handler(
    headers: HeaderMap,
    Path(key): Path<String>,
    Json(course): Json<courses::Course>,
) -> Result<impl IntoResponse, AppError> {
    check_editor_password(&headers)?;
    log::info!("Course updated: {} ({})", course.name, key);
    db::with_connection(|conn| courses::update(conn, &key, &course))?;
    Ok(StatusCode::OK)
}

async fn delete_course_handler(
    headers: HeaderMap,
    Path(key): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    check_editor_password(&headers)?;
    db::with_connection(|conn| courses::delete(conn, &key))?;
    Ok(StatusCode::OK)
}

async fn races_handler(State(race_manager): State<RaceManager>) -> impl IntoResponse {
    let races = race_manager.list_races().await;
    Json(races)
}

#[derive(Deserialize)]
struct LeaderboardQuery {
    #[serde(default = "default_limit")]
    limit: u32,
}

fn default_limit() -> u32 {
    10
}

async fn leaderboard_handler(
    Path(course_key): Path<String>,
    Query(query): Query<LeaderboardQuery>,
) -> Result<impl IntoResponse, AppError> {
    let entries =
        db::with_connection(|conn| race_results::get_leaderboard(conn, &course_key, query.limit))?;
    Ok(Json(entries))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ReplayResponse {
    path_url: String,
}

async fn replay_handler(Path(result_id): Path<i64>) -> Result<impl IntoResponse, AppError> {
    let path_key = db::with_connection(|conn| race_results::get_path_key(conn, result_id))?;

    match path_key {
        Some(key) => {
            let url = config().s3.paths_url(&key);
            Ok(Json(ReplayResponse { path_url: url }))
        }
        None => Err(AppError::Internal(anyhow::anyhow!("Race result not found"))),
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RandomWindResponse {
    png_url: String,
}

async fn random_wind_handler() -> Result<impl IntoResponse, AppError> {
    let report = wind_reports::get_random_report()?;

    match report {
        Some(r) => Ok(Json(RandomWindResponse { png_url: r.png_url() })),
        None => Err(AppError::Internal(anyhow::anyhow!("No wind reports available"))),
    }
}

// ============================================================================
// Auth Endpoints
// ============================================================================

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequestVerificationBody {
    email: String,
    name: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RequestVerificationResponse {
    message: String,
}

async fn request_verification_handler(
    Json(body): Json<RequestVerificationBody>,
) -> Result<impl IntoResponse, AppError> {
    // Validate email format (basic check)
    if !body.email.contains('@') || body.email.len() < 3 {
        return Err(AppError::Internal(anyhow::anyhow!("Invalid email address")));
    }

    // Create verification token
    let token = db::with_connection(|conn| {
        players::create_verification_token(conn, &body.email, body.name.as_deref())
    })?;

    // Send verification email
    email::send_verification_email(&body.email, &token).await?;

    Ok(Json(RequestVerificationResponse {
        message: "Verification email sent".to_string(),
    }))
}

#[derive(Deserialize)]
struct VerifyEmailQuery {
    token: String,
}

async fn verify_email_handler(
    Query(query): Query<VerifyEmailQuery>,
) -> Result<impl IntoResponse, AppError> {
    let result = db::with_connection(|conn| players::verify_email(conn, &query.token))?;

    match result {
        Some((auth_token, email)) => {
            // Return HTML page that stores the auth token and redirects
            let app_url = &config().app_url;
            let html = format!(
                r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Email Verified - Rewind</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }}
    .container {{
      text-align: center;
      padding: 40px;
    }}
    h1 {{
      color: #f59e0b;
      margin-bottom: 16px;
    }}
    p {{
      color: #94a3b8;
      margin-bottom: 24px;
    }}
    .success {{
      color: #22c55e;
      font-size: 48px;
      margin-bottom: 16px;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="success">&#10003;</div>
    <h1>Email Verified!</h1>
    <p>Your email has been verified. Redirecting to Rewind...</p>
  </div>
  <script>
    // Store auth token in localStorage
    localStorage.setItem('rewind:auth_token', '{auth_token}');
    localStorage.setItem('rewind:email', '{email}');

    // Redirect to app after a short delay
    setTimeout(function() {{
      window.location.href = '{app_url}';
    }}, 1500);
  </script>
</body>
</html>"#,
                auth_token = auth_token,
                email = email,
                app_url = app_url
            );
            Ok(Html(html))
        }
        None => {
            // Return error page
            let html = r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Verification Failed - Rewind</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      padding: 40px;
    }
    h1 {
      color: #ef4444;
      margin-bottom: 16px;
    }
    p {
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Verification Failed</h1>
    <p>This verification link is invalid or has expired.</p>
    <p>Please request a new verification email.</p>
  </div>
</body>
</html>"#;
            Ok(Html(html.to_string()))
        }
    }
}

fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string())
}

async fn auth_me_handler(headers: HeaderMap) -> Result<impl IntoResponse, AppError> {
    let auth_token = extract_bearer_token(&headers).ok_or(AppError::Unauthorized)?;

    let player = db::with_connection(|conn| players::get_player_by_auth_token(conn, &auth_token))?
        .ok_or(AppError::Unauthorized)?;

    let info: players::PlayerInfo = player.into();
    Ok(Json(info))
}

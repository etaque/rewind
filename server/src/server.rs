use axum::{
    Json, Router,
    extract::{Path, Query, State, ws::WebSocketUpgrade},
    http::{header, HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{any, get, post, put},
};
use bytes::Bytes;
use object_store::ObjectStoreExt;
use object_store::path::Path as S3Path;
use serde::Deserialize;
use tower_http::{compression::CompressionLayer, cors::CorsLayer};

use crate::{
    auth, config::config, courses,
    multiplayer::{RaceManager, handle_websocket},
    profiles, race_results, wind_reports,
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
    // Clean up expired sessions and verification codes on startup
    if let Err(e) = auth::cleanup_expired().await {
        log::warn!("Failed to clean up expired auth data: {}", e);
    }

    let race_manager = RaceManager::new();

    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
            axum::http::header::HeaderName::from_static("x-editor-password"),
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
        // Auth routes
        .route("/auth/start", post(start_auth_handler))
        .route("/auth/verify", post(verify_auth_handler))
        .route("/auth/logout", post(logout_handler))
        // Profile routes (requires auth)
        .route("/account/profiles", get(list_profiles_handler).post(create_profile_handler))
        .route("/account/profiles/{id}", put(update_profile_handler).delete(delete_profile_handler))
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
    let report_count = wind_reports::get_report_count().await?;

    Ok(format!("OK ({} wind reports)", report_count))
}

async fn verify_editor_password_handler(
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    check_editor_password(&headers)?;
    Ok(StatusCode::OK)
}

async fn courses_handler() -> Result<impl IntoResponse, AppError> {
    let courses = courses::get_all().await?;
    Ok(Json(courses))
}

async fn create_course_handler(
    headers: HeaderMap,
    Json(course): Json<courses::Course>,
) -> Result<impl IntoResponse, AppError> {
    check_editor_password(&headers)?;
    log::info!("Course created: {} ({})", course.name, course.key);
    courses::insert(&course).await?;
    Ok(StatusCode::CREATED)
}

async fn update_course_handler(
    headers: HeaderMap,
    Path(key): Path<String>,
    Json(course): Json<courses::Course>,
) -> Result<impl IntoResponse, AppError> {
    check_editor_password(&headers)?;
    log::info!("Course updated: {} ({})", course.name, key);
    courses::update(&key, &course).await?;
    Ok(StatusCode::OK)
}

async fn delete_course_handler(
    headers: HeaderMap,
    Path(key): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    check_editor_password(&headers)?;
    courses::delete(&key).await?;
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
    let entries = race_results::get_leaderboard(&course_key, query.limit).await?;
    Ok(Json(entries))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ReplayResponse {
    path_url: String,
}

async fn replay_handler(Path(result_id): Path<i64>) -> Result<impl IntoResponse, AppError> {
    let path_key = race_results::get_path_key(result_id).await?;

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
    let report = wind_reports::get_random_report().await?;

    match report {
        Some(r) => Ok(Json(RandomWindResponse { png_url: r.png_url() })),
        None => Err(AppError::Internal(anyhow::anyhow!("No wind reports available"))),
    }
}

// ===== Auth handlers =====

async fn start_auth_handler(
    Json(request): Json<auth::StartAuthRequest>,
) -> Result<impl IntoResponse, AppError> {
    auth::start_auth(&request.email).await?;
    Ok(StatusCode::OK)
}

async fn verify_auth_handler(
    Json(request): Json<auth::VerifyAuthRequest>,
) -> Result<impl IntoResponse, AppError> {
    let result = auth::verify_auth(&request.email, &request.code).await?;
    Ok(Json(result))
}

async fn logout_handler(headers: HeaderMap) -> Result<impl IntoResponse, AppError> {
    if let Some(token) = extract_session_token(&headers) {
        auth::logout(&token).await?;
    }
    Ok(StatusCode::OK)
}

/// Extract session token from Authorization header (Bearer token).
fn extract_session_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string())
}

/// Validate session and return account ID, or return 401 Unauthorized.
async fn require_auth(headers: &HeaderMap) -> Result<String, AppError> {
    let token = extract_session_token(headers).ok_or(AppError::Unauthorized)?;
    let account_id = auth::validate_session(&token)
        .await?
        .ok_or(AppError::Unauthorized)?;
    Ok(account_id)
}

// ===== Profile handlers =====

async fn list_profiles_handler(headers: HeaderMap) -> Result<impl IntoResponse, AppError> {
    let account_id = require_auth(&headers).await?;
    let profiles = profiles::list_profiles(&account_id).await?;
    Ok(Json(profiles))
}

async fn create_profile_handler(
    headers: HeaderMap,
    Json(request): Json<profiles::CreateProfileRequest>,
) -> Result<impl IntoResponse, AppError> {
    let account_id = require_auth(&headers).await?;
    let profile = profiles::create_profile(&account_id, &request.name).await?;
    Ok((StatusCode::CREATED, Json(profile)))
}

async fn update_profile_handler(
    headers: HeaderMap,
    Path(profile_id): Path<String>,
    Json(request): Json<profiles::UpdateProfileRequest>,
) -> Result<impl IntoResponse, AppError> {
    let account_id = require_auth(&headers).await?;
    let profile = profiles::update_profile(&account_id, &profile_id, &request.name).await?;
    Ok(Json(profile))
}

async fn delete_profile_handler(
    headers: HeaderMap,
    Path(profile_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let account_id = require_auth(&headers).await?;
    profiles::delete_profile(&account_id, &profile_id).await?;
    Ok(StatusCode::OK)
}

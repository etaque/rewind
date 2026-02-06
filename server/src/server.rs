use axum::{
    Json, Router,
    extract::{Path, Query, State, ws::WebSocketUpgrade},
    http::{header, HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{any, delete, get, post, put},
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

/// Check if the request is from an admin user.
/// Requires a valid session token for an account with the admin email.
async fn check_admin(headers: &HeaderMap) -> Result<(), AppError> {
    let admin_email = &config().admin_email;
    if admin_email.is_empty() {
        return Err(AppError::Unauthorized);
    }

    let account_id = require_auth(headers).await?;
    let email = auth::get_account_email(&account_id)
        .await?
        .ok_or(AppError::Unauthorized)?;

    if email.to_lowercase() == admin_email.to_lowercase() {
        Ok(())
    } else {
        Err(AppError::Unauthorized)
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
        ]);

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/editor/verify", get(verify_editor_access_handler))
        .route("/courses", get(courses_handler).post(create_course_handler))
        .route("/courses/reorder", put(reorder_courses_handler))
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
        // Account routes (requires auth)
        .route("/account/me", get(account_me_handler))
        .route("/account/profiles", get(list_profiles_handler).post(create_profile_handler))
        .route("/account/profiles/{id}", put(update_profile_handler).delete(delete_profile_handler))
        // Admin routes (requires admin)
        .route("/admin/accounts", get(admin_list_accounts_handler))
        .route("/admin/accounts/{id}", delete(admin_delete_account_handler))
        .route("/admin/results", get(admin_list_results_handler))
        .route("/admin/results/{id}", delete(admin_delete_result_handler))
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

async fn verify_editor_access_handler(
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    check_admin(&headers).await?;
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
    check_admin(&headers).await?;
    log::info!("Course created: {} ({})", course.name, course.key);
    courses::insert(&course).await?;
    Ok(StatusCode::CREATED)
}

async fn update_course_handler(
    headers: HeaderMap,
    Path(key): Path<String>,
    Json(course): Json<courses::Course>,
) -> Result<impl IntoResponse, AppError> {
    check_admin(&headers).await?;
    log::info!("Course updated: {} ({})", course.name, key);
    courses::update(&key, &course).await?;
    Ok(StatusCode::OK)
}

async fn delete_course_handler(
    headers: HeaderMap,
    Path(key): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    check_admin(&headers).await?;
    courses::delete(&key).await?;
    Ok(StatusCode::OK)
}

async fn reorder_courses_handler(
    headers: HeaderMap,
    Json(keys): Json<Vec<String>>,
) -> Result<impl IntoResponse, AppError> {
    check_admin(&headers).await?;
    courses::reorder(&keys).await?;
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

// ===== Account handlers =====

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AccountMeResponse {
    is_admin: bool,
}

async fn account_me_handler(headers: HeaderMap) -> Result<impl IntoResponse, AppError> {
    let account_id = require_auth(&headers).await?;
    let email = auth::get_account_email(&account_id)
        .await?
        .ok_or(AppError::Unauthorized)?;

    let admin_email = &config().admin_email;
    let is_admin = !admin_email.is_empty() && email.to_lowercase() == admin_email.to_lowercase();

    Ok(Json(AccountMeResponse { is_admin }))
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

// ===== Admin handlers =====

#[derive(Deserialize)]
struct AdminPaginationQuery {
    #[serde(default = "default_admin_limit")]
    limit: i64,
    #[serde(default)]
    offset: i64,
}

fn default_admin_limit() -> i64 {
    50
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminAccountsResponse {
    accounts: Vec<auth::AdminAccount>,
    total: i64,
}

async fn admin_list_accounts_handler(
    headers: HeaderMap,
    Query(query): Query<AdminPaginationQuery>,
) -> Result<impl IntoResponse, AppError> {
    check_admin(&headers).await?;
    let accounts = auth::list_accounts(query.limit, query.offset).await?;
    let total = auth::count_accounts().await?;
    Ok(Json(AdminAccountsResponse { accounts, total }))
}

async fn admin_delete_account_handler(
    headers: HeaderMap,
    Path(account_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    check_admin(&headers).await?;
    auth::delete_account(&account_id).await?;
    log::info!("Admin deleted account: {}", account_id);
    Ok(StatusCode::OK)
}

#[derive(Deserialize)]
struct AdminResultsQuery {
    #[serde(default = "default_admin_limit")]
    limit: i64,
    #[serde(default)]
    offset: i64,
    course_key: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminResultsResponse {
    results: Vec<race_results::AdminRaceResult>,
    total: i64,
}

async fn admin_list_results_handler(
    headers: HeaderMap,
    Query(query): Query<AdminResultsQuery>,
) -> Result<impl IntoResponse, AppError> {
    check_admin(&headers).await?;
    let results =
        race_results::list_all(query.limit, query.offset, query.course_key.as_deref()).await?;
    let total = race_results::count_all(query.course_key.as_deref()).await?;
    Ok(Json(AdminResultsResponse { results, total }))
}

async fn admin_delete_result_handler(
    headers: HeaderMap,
    Path(result_id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    check_admin(&headers).await?;
    let path_key = race_results::delete_result(result_id).await?;

    // Delete the S3 path file if it existed
    if let Some(key) = &path_key {
        if let Err(e) = s3::paths_client()
            .delete(&S3Path::from(key.as_str()))
            .await
        {
            log::warn!("Failed to delete S3 path file {}: {}", key, e);
        }
    }

    log::info!("Admin deleted race result: {}", result_id);
    Ok(StatusCode::OK)
}

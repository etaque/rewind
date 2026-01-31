use axum::{
    Json, Router,
    extract::{Path, Query, State, ws::WebSocketUpgrade},
    http::{Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{any, get, put},
};
use bytes::Bytes;
use object_store::ObjectStoreExt;
use object_store::path::Path as S3Path;
use serde::Deserialize;
use tower_http::{compression::CompressionLayer, cors::CorsLayer};

use crate::{
    config::config,
    courses, db,
    multiplayer::{RaceManager, handle_websocket},
    race_results, wind_reports,
};

use super::s3;

// Make our own error that wraps `anyhow::Error`.
struct AppError(anyhow::Error);

// Tell axum how to convert `AppError` into a response.
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Something went wrong: {}", self.0),
        )
            .into_response()
    }
}

impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(err: E) -> Self {
        Self(err.into())
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
        .allow_headers([axum::http::header::CONTENT_TYPE]);

    let app = Router::new()
        .route("/health", get(health_handler))
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

async fn courses_handler() -> Result<impl IntoResponse, AppError> {
    let courses = db::with_connection(|conn| courses::get_all(conn))?;
    Ok(Json(courses))
}

async fn create_course_handler(
    Json(course): Json<courses::Course>,
) -> Result<impl IntoResponse, AppError> {
    log::info!("Course created: {} ({})", course.name, course.key);
    db::with_connection(|conn| courses::insert(conn, &course))?;
    Ok(StatusCode::CREATED)
}

async fn update_course_handler(
    Path(key): Path<String>,
    Json(course): Json<courses::Course>,
) -> Result<impl IntoResponse, AppError> {
    log::info!("Course updated: {} ({})", course.name, key);
    db::with_connection(|conn| courses::update(conn, &key, &course))?;
    Ok(StatusCode::OK)
}

async fn delete_course_handler(Path(key): Path<String>) -> Result<impl IntoResponse, AppError> {
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
        None => Err(AppError(anyhow::anyhow!("Race result not found"))),
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
        None => Err(AppError(anyhow::anyhow!("No wind reports available"))),
    }
}

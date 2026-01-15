use axum::{
    extract::{ws::WebSocketUpgrade, Path, State},
    http::{Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{any, get},
    Json, Router,
};
use bytes::Bytes;
use chrono::{DateTime, Utc};
use object_store::path::Path as S3Path;
use object_store::ObjectStoreExt;
use serde::Serialize;
use tower_http::{compression::CompressionLayer, cors::CorsLayer};

use crate::{
    courses,
    multiplayer::{handle_websocket, LobbyManager},
};

use super::manifest::{self, Manifest};
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
    State(lobby_manager): State<LobbyManager>,
) -> Response {
    ws.on_upgrade(move |socket| handle_websocket(socket, lobby_manager))
}

pub async fn run(address: std::net::SocketAddr) {
    let lobby_manager = LobbyManager::new();

    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods([Method::GET]);

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/courses", get(courses_handler))
        .route("/wind-reports/since/{since_ms}", get(reports_since_handler))
        .route("/multiplayer/lobbies", get(lobbies_handler))
        .route("/multiplayer/lobby", any(websocket_handler))
        .layer(CompressionLayer::new())
        .layer(cors)
        .with_state(lobby_manager);

    let listener = tokio::net::TcpListener::bind(address).await.unwrap();
    log::info!("Server listening on {}", address);
    axum::serve(listener, app).await.unwrap();
}

async fn health_handler() -> Result<String, AppError> {
    // Check GRIB bucket write access
    let s3 = s3::grib_client();
    let health_path = S3Path::from("/healthcheck");
    s3.put(&health_path, Bytes::new().into()).await?;

    // Check manifest is readable from raster bucket
    let manifest = Manifest::load().await?;

    Ok(format!("OK ({} wind reports)", manifest.reports.len()))
}

async fn courses_handler() -> impl IntoResponse {
    Json(courses::all())
}

async fn lobbies_handler(State(lobby_manager): State<LobbyManager>) -> impl IntoResponse {
    let lobbies = lobby_manager.list_lobbies().await;
    Json(lobbies)
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindReportResponse {
    #[serde(with = "chrono::serde::ts_milliseconds")]
    time: DateTime<Utc>,
    png_url: String,
}

impl From<&manifest::WindReport> for WindReportResponse {
    fn from(report: &manifest::WindReport) -> Self {
        WindReportResponse {
            time: report.time,
            png_url: report.png_url(),
        }
    }
}

async fn reports_since_handler(Path(since_ms): Path<i64>) -> Result<impl IntoResponse, AppError> {
    let since = DateTime::from_timestamp_millis(since_ms).unwrap_or_else(Utc::now);

    let manifest = Manifest::load().await?;

    let reports: Vec<WindReportResponse> = manifest
        .reports_since(since, 100)
        .into_iter()
        .map(|r| r.into())
        .collect();

    Ok(Json(reports))
}

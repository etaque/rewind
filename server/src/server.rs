use axum::{
    Json, Router,
    extract::{State, ws::WebSocketUpgrade},
    http::{Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{any, get},
};
use bytes::Bytes;
use object_store::ObjectStoreExt;
use object_store::path::Path as S3Path;
use tower_http::{compression::CompressionLayer, cors::CorsLayer};

use crate::{
    courses,
    multiplayer::{RaceManager, handle_websocket},
};

use super::manifest::Manifest;
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
        .allow_methods([Method::GET]);

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/courses", get(courses_handler))
        .route("/multiplayer/races", get(races_handler))
        .route("/multiplayer/race", any(websocket_handler))
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

    // Check manifest is readable from raster bucket
    let manifest = Manifest::load().await?;

    Ok(format!("OK ({} wind reports)", manifest.reports.len()))
}

async fn courses_handler() -> impl IntoResponse {
    Json(courses::all())
}

async fn races_handler(State(race_manager): State<RaceManager>) -> impl IntoResponse {
    let races = race_manager.list_races().await;
    Json(races)
}

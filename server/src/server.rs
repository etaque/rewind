use bytes::Bytes;
use chrono::{DateTime, Utc};
use object_store::path::Path;
use object_store::ObjectStoreExt;
use serde::Serialize;
use std::convert::Infallible;
use std::str::FromStr;
use uuid::Uuid;
use warp::http::header::HeaderValue;
use warp::http::Response;
use warp::http::StatusCode;
use warp::{path, Filter, Rejection, Reply};

use super::courses;
use super::db;
use super::grib_store;
use super::messages;
use super::models::RasterRenderingMode;
use super::multiplayer::{handle_websocket, LobbyInfo, LobbyManager};
use super::repos;

pub async fn run(address: std::net::SocketAddr, database_url: &str) {
    let pool = db::pool(&database_url)
        .await
        .expect(format!("Failed to connect to DB: {}", &database_url).as_str());

    let lobby_manager = LobbyManager::new();

    let cors = warp::cors().allow_any_origin().allow_methods(vec!["GET"]);

    let health_route = path!("health").and(with_db(pool.clone())).and_then(health);

    let reports_since_route = path!("wind-reports" / "since" / i64)
        .and(with_db(pool.clone()))
        .and_then(reports_since);

    let raster_wkb_route = path!("wind-reports" / Uuid / "raster.wkb")
        .and(with_db(pool.clone()))
        .and_then(raster_wkb);

    let raster_png_route = path!("wind-reports" / Uuid / RasterRenderingMode)
        .and(with_db(pool.clone()))
        .and_then(raster_png);

    // List available courses
    let courses_route = path!("courses")
        .and(warp::get())
        .map(|| warp::reply::json(&courses::all()));

    // List available lobbies
    let lobbies_list_route = path!("multiplayer" / "lobbies")
        .and(warp::get())
        .and(with_lobby_manager(lobby_manager.clone()))
        .and_then(list_lobbies);

    // WebSocket route for multiplayer signaling
    let multiplayer_route = path!("multiplayer" / "lobby")
        .and(warp::ws())
        .and(with_lobby_manager(lobby_manager))
        .map(|ws: warp::ws::Ws, manager: LobbyManager| {
            ws.on_upgrade(move |socket| handle_websocket(socket, manager))
        });

    let routes = health_route
        .or(courses_route)
        .or(reports_since_route)
        .or(raster_png_route)
        .or(raster_wkb_route)
        .or(lobbies_list_route)
        .or(multiplayer_route)
        .recover(rejection)
        .with(cors)
        .with(warp::compression::gzip());

    warp::serve(routes).run(address).await
}

fn with_lobby_manager(
    manager: LobbyManager,
) -> impl Filter<Extract = (LobbyManager,), Error = Infallible> + Clone {
    warp::any().map(move || manager.clone())
}

fn with_db(db_pool: db::Pool) -> impl Filter<Extract = (db::Pool,), Error = Infallible> + Clone {
    warp::any().map(move || db_pool.clone())
}

pub async fn list_lobbies(manager: LobbyManager) -> Result<impl Reply, Rejection> {
    let lobbies: Vec<LobbyInfo> = manager.list_lobbies().await;
    Ok(warp::reply::json(&lobbies))
}

pub async fn health(pool: db::Pool) -> Result<impl Reply, Rejection> {
    let s3 = grib_store::s3_client();
    let health_path = Path::from("/healthcheck");
    let (s3_health, db_health) =
        tokio::join!(s3.put(&health_path, Bytes::new().into()), db::health(&pool));
    match (s3_health, db_health) {
        (Ok(_), Ok(_)) => Ok(warp::reply::with_status("OK", StatusCode::OK)),
        (Err(e), _) => Err(warp::reject::custom(Error(e.into()))),
        (_, Err(e)) => Err(warp::reject::custom(Error(e))),
    }
}

impl FromStr for RasterRenderingMode {
    type Err = ();
    fn from_str(s: &str) -> Result<RasterRenderingMode, ()> {
        match s {
            "u.png" => Ok(RasterRenderingMode::U),
            "v.png" => Ok(RasterRenderingMode::V),
            "uv.png" => Ok(RasterRenderingMode::UV),
            "speed.png" => Ok(RasterRenderingMode::Speed),
            _ => Err(()),
        }
    }
}

pub async fn reports_since(since_ms: i64, pool: db::Pool) -> Result<impl Reply, Rejection> {
    let client = pool
        .get()
        .await
        .map_err(|e| warp::reject::custom(Error(e.into())))?;

    let since = DateTime::from_timestamp_millis(since_ms).unwrap_or_else(|| Utc::now());

    let db_reports = repos::wind_reports::list_since(&client, &since, 100i64)
        .await
        .map_err(|e| warp::reject::custom(Error(e.into())))?;

    let reports: Vec<messages::WindReport> = db_reports.into_iter().map(|r| r.into()).collect();

    Ok(warp::reply::json(&reports))
}

pub async fn raster_png(
    report_id: Uuid,
    mode: RasterRenderingMode,
    pool: db::Pool,
) -> Result<impl Reply, Rejection> {
    let client = pool
        .get()
        .await
        .map_err(|e| warp::reject::custom(Error(e.into())))?;

    let report = repos::wind_reports::get(&client, report_id)
        .await
        .map_err(|_| warp::reject::not_found())?;

    let blob = repos::wind_rasters::as_png(&client, &report.raster_id, mode)
        .await
        .map_err(|e| warp::reject::custom(Error(e.into())))?;

    Response::builder()
        .header("Content-Type", HeaderValue::from_static("image/png"))
        .body(blob)
        .map_err(|e| warp::reject::custom(Error(e.into())))
}

pub async fn raster_wkb(report_id: Uuid, pool: db::Pool) -> Result<impl Reply, Rejection> {
    let client = pool
        .get()
        .await
        .map_err(|e| warp::reject::custom(Error(e.into())))?;

    let report = repos::wind_reports::get(&client, report_id)
        .await
        .map_err(|_| warp::reject::not_found())?;

    let blob = repos::wind_rasters::as_wkb(&client, &report.raster_id)
        .await
        .map_err(|e| warp::reject::custom(Error(e.into())))?;

    Response::builder()
        .header(
            "Content-Type",
            HeaderValue::from_static("binary/octet-stream"),
        )
        .body(blob)
        .map_err(|e| warp::reject::custom(Error(e.into())))
}

#[derive(Debug)]
struct Error(anyhow::Error);
impl warp::reject::Reject for Error {}

#[derive(Serialize)]
struct ErrorMessage {
    code: u16,
    message: String,
}

pub async fn rejection(err: warp::Rejection) -> Result<impl Reply, Infallible> {
    let (code, message) = if err.is_not_found() {
        (StatusCode::NOT_FOUND, "Not found".to_string())
    } else if let Some(e) = err.find::<warp::reject::MethodNotAllowed>() {
        (StatusCode::METHOD_NOT_ALLOWED, e.to_string())
    } else if let Some(e) = err.find::<warp::reject::InvalidQuery>() {
        (StatusCode::BAD_REQUEST, e.to_string())
    } else if let Some(e) = err.find::<warp::reject::MissingHeader>() {
        (StatusCode::BAD_REQUEST, e.to_string())
    } else if let Some(Error(e)) = err.find::<Error>() {
        log::error!("Internal error: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error".to_string(),
        )
    } else {
        log::error!("Unhandled rejection: {:?}", err);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error".to_string(),
        )
    };

    let json = warp::reply::json(&ErrorMessage {
        code: code.as_u16(),
        message,
    });

    Ok(warp::reply::with_status(json, code))
}

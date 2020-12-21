use serde::Serialize;
use std::convert::Infallible;
use std::str::FromStr;
use uuid::Uuid;
use warp::http::header::HeaderValue;
use warp::http::Response;
use warp::http::StatusCode;
use warp::{Filter, Rejection, Reply};

use super::db;
use super::repos;

pub async fn run(address: std::net::SocketAddr, database_url: &str) {
    let pool = db::pool(&database_url)
        .await
        .expect(format!("Failed to connect to DB: {}", &database_url).as_str());

    let health_route = warp::path!("health")
        .and(with_db(pool.clone()))
        .and_then(health);

    let session_route = warp::path("session")
        .and(warp::ws())
        .and(with_db(pool.clone()))
        .map(|ws: warp::ws::Ws, pool: db::Pool| {
            ws.on_upgrade(move |socket| crate::session::start(socket, pool))
        });

    let rasters_route = warp::path!("wind-reports" / Uuid / RasterBand)
        .and(with_db(pool.clone()))
        .and_then(png_raster);

    let routes = health_route
        .or(session_route)
        .or(rasters_route)
        .recover(rejection);

    warp::serve(routes).run(address).await
}

fn with_db(db_pool: db::Pool) -> impl Filter<Extract = (db::Pool,), Error = Infallible> + Clone {
    warp::any().map(move || db_pool.clone())
}

pub async fn health(pool: db::Pool) -> Result<impl Reply, Rejection> {
    db::health(&pool)
        .await
        .map_err(|e| warp::reject::custom(Error(e)))
        .map(|_| StatusCode::OK)
}

pub enum RasterBand {
    U,
    V,
}

impl FromStr for RasterBand {
    type Err = ();
    fn from_str(s: &str) -> Result<RasterBand, ()> {
        match s {
            "u.png" => Ok(RasterBand::U),
            "v.png" => Ok(RasterBand::V),
            _ => Err(()),
        }
    }
}

pub async fn png_raster(
    report_id: Uuid,
    band: RasterBand,
    pool: db::Pool,
) -> Result<impl Reply, Rejection> {
    let client = pool
        .get()
        .await
        .map_err(|e| warp::reject::custom(Error(e.into())))?;
    let report = repos::wind_reports::get(&client, report_id)
        .await
        .map_err(|_| warp::reject::not_found())?;

    let band_id = match band {
        RasterBand::U => repos::wind_rasters::U_BAND,
        RasterBand::V => repos::wind_rasters::V_BAND,
    };

    let blob = repos::wind_rasters::as_png(&client, &report.raster_id, band_id)
        .await
        .map_err(|e| warp::reject::custom(Error(e.into())))?;

    Response::builder()
        .header("Content-Type", HeaderValue::from_static("image/png"))
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
    let code = StatusCode::INTERNAL_SERVER_ERROR;
    let message = "Internal server error.";

    log::error!("Error: {:?}", err);

    let json = warp::reply::json(&ErrorMessage {
        code: code.as_u16(),
        message: message.into(),
    });

    Ok(warp::reply::with_status(json, code))
}

use contour::ContourBuilder;
use serde::Serialize;
use std::convert::Infallible;
use std::str::FromStr;
use uuid::Uuid;
use warp::http::header::HeaderValue;
use warp::http::Response;
use warp::http::StatusCode;
use warp::{path, Filter, Rejection, Reply};

use super::db;
use super::models::RasterRenderingMode;
use super::repos;

pub async fn run(address: std::net::SocketAddr, database_url: &str) {
    let pool = db::pool(&database_url)
        .await
        .expect(format!("Failed to connect to DB: {}", &database_url).as_str());

    let health_route = path!("health").and(with_db(pool.clone())).and_then(health);

    let session_route = path!("session")
        .and(warp::ws())
        .and(with_db(pool.clone()))
        .map(|ws: warp::ws::Ws, pool: db::Pool| {
            ws.on_upgrade(move |socket| crate::session::start(socket, pool))
        });

    let isotachs = path!("wind-reports" / Uuid / "isotachs.json")
        .and(with_db(pool.clone()))
        .and_then(isotachs_json);

    let points_blob = path!("wind-reports" / Uuid / "points.blob")
        .and(with_db(pool.clone()))
        .and_then(points_blob)
        .with(warp::compression::gzip());

    let points_json = path!("wind-reports" / Uuid / "points.json")
        .and(with_db(pool.clone()))
        .and_then(points_geojson);

    let raster_route = path!("wind-reports" / Uuid / RasterRenderingMode)
        .and(with_db(pool.clone()))
        .and_then(raster_png);

    let routes = health_route
        .or(session_route)
        .or(isotachs)
        .or(points_json)
        .or(points_blob)
        .or(raster_route)
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

impl FromStr for RasterRenderingMode {
    type Err = ();
    fn from_str(s: &str) -> Result<RasterRenderingMode, ()> {
        match s {
            "u.png" => Ok(RasterRenderingMode::U),
            "v.png" => Ok(RasterRenderingMode::V),
            "speed.png" => Ok(RasterRenderingMode::Speed),
            _ => Err(()),
        }
    }
}

// TODO:
// - reduce verbosity of error casting

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

    let blob = repos::wind_rasters::raster(&client, &report.raster_id, mode)
        .await
        .map_err(|e| warp::reject::custom(Error(e.into())))?;

    Response::builder()
        .header("Content-Type", HeaderValue::from_static("image/png"))
        .body(blob)
        .map_err(|e| warp::reject::custom(Error(e.into())))
}

pub async fn points_geojson(report_id: Uuid, pool: db::Pool) -> Result<impl Reply, Rejection> {
    let client = pool
        .get()
        .await
        .map_err(|e| warp::reject::custom(Error(e.into())))?;

    let report = repos::wind_reports::get(&client, report_id)
        .await
        .map_err(|_| warp::reject::not_found())?;

    let geojson = repos::wind_rasters::points_geojson(&client, &report.raster_id)
        .await
        .map_err(|e| warp::reject::custom(Error(e.into())))?;

    Ok(warp::reply::json(&geojson))
}

pub async fn points_blob(report_id: Uuid, pool: db::Pool) -> Result<impl Reply, Rejection> {
    let client = pool
        .get()
        .await
        .map_err(|e| warp::reject::custom(Error(e.into())))?;

    let report = repos::wind_reports::get(&client, report_id)
        .await
        .map_err(|_| warp::reject::not_found())?;

    let blob = repos::wind_rasters::points_blob(&client, &report.raster_id)
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

//  Painfully slow, not even parallelized.  Keeping it around until we figure out rendering.
pub async fn isotachs_json(report_id: Uuid, pool: db::Pool) -> Result<impl Reply, Rejection> {
    let client = pool
        .get()
        .await
        .map_err(|e| warp::reject::custom(Error(e.into())))?;

    let report = repos::wind_reports::get(&client, report_id)
        .await
        .map_err(|_| warp::reject::not_found())?;

    let values_arr = repos::wind_rasters::speed_values(&client, &report.raster_id)
        .await
        .map_err(|e| warp::reject::custom(Error(e.into())))?;

    match values_arr.dimensions() {
        [x, y] => {
            let c = ContourBuilder::new(x.len as u32, y.len as u32, false); // x dim., y dim., smoothing
            let res = c
                .contours(&values_arr.into_inner(), &[5.0, 10.0, 15.0, 20.0])
                .map_err(|e| warp::reject::custom(Error(e.into())))?;

            Ok(warp::reply::json(&res))
        }
        _ => Err(warp::reject::custom(Error(anyhow::Error::msg(format!(
            "Unexpected wind array dimensions: {:#?}",
            values_arr.dimensions(),
        ))))),
    }
}

#[derive(Debug)]
struct Error(anyhow::Error);
impl warp::reject::Reject for Error {}

#[derive(Serialize)]
struct ErrorMessage {
    code: u16,
    message: String,
}

// TODO properly handle 404
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

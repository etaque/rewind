use crate::cli::GribRangeArgs;
use crate::config::config;
use crate::db;
use crate::models::WindReport;
use crate::repos;
use anyhow::anyhow;
use bytes::Bytes;
use chrono::{Days, NaiveDate, TimeDelta, Utc};
use object_store::{aws, ObjectStoreExt};
use reqwest;
use uuid::Uuid;

pub fn s3_client() -> aws::AmazonS3 {
    let s3 = &config().s3;
    aws::AmazonS3Builder::new()
        .with_region(&s3.region)
        .with_endpoint(&s3.endpoint)
        .with_bucket_name(&s3.bucket)
        .with_access_key_id(&s3.access_key)
        .with_secret_access_key(&s3.secret_key)
        .with_allow_http(true)
        // Use path-style URLs (http://localhost:9000/bucket/key) instead of
        // virtual-hosted style (http://bucket.localhost:9000/key) for MinIO
        .with_virtual_hosted_style_request(false)
        .build()
        .unwrap()
}

// Hours of the day when GRIB files are generated (0, 6, 12, 18)
const HOURS: [i16; 4] = [0, 6, 12, 18];
// Forecast offsets in hours (3, 6)
const FORECASTS: [i16; 2] = [3, 6];

const BASE_URL: &str = "https://grib.v-l-m.org/archives";

/// Import all GRIB files for a date range
pub async fn import_grib_range(db_url: &str, args: GribRangeArgs) -> anyhow::Result<()> {
    let pool = db::pool(db_url).await?;

    let s3 = s3_client();

    let mut current_day = args.from;
    let end_day = args.to.checked_add_days(Days::new(1)).unwrap();

    while current_day < end_day {
        for hour in HOURS {
            for forecast in FORECASTS {
                handle_grib(&pool, &s3, current_day, hour, forecast).await?;
            }
        }
        current_day = current_day.checked_add_days(Days::new(1)).unwrap();
    }

    println!("Finished.");
    Ok(())
}

async fn handle_grib(
    pool: &db::Pool,
    s3: &aws::AmazonS3,
    day: NaiveDate,
    hour: i16,
    forecast: i16,
) -> anyhow::Result<()> {
    let client = pool.get().await?;
    if let Some(_) =
        repos::wind_reports::get_by_day_hour_forecast(&client, day, hour, forecast).await?
    {
        println!("skipped (already exists)");
        return Ok(());
    }

    let day_path = day.format("%Y/%m%d");

    let grib_path = format!(
        "{}/gfs.t{:02}z.pgrb2full.0p50.f{:03}.grib2",
        day_path, hour, forecast
    );
    let url = format!("{}/{}", BASE_URL, grib_path);

    let id = Uuid::new_v4();

    print!("  {} ... ", grib_path);

    let grib_data = match read_grib(&s3, &grib_path).await {
        Ok(data) => data,
        Err(_) => match download_grib(&url).await {
            Ok(data) if data.is_empty() => {
                println!("skipped (not found)");
                return Ok(());
            }
            Ok(data) => {
                save_grib(&s3, &grib_path, data.clone()).await?;
                data
            }
            Err(e) => {
                println!("error: {}", e);
                return Ok(());
            }
        },
    };

    let target_time =
        day.and_hms_opt(hour as u32, 0, 0).unwrap().and_utc() + TimeDelta::hours(forecast.into());

    let raster_id = Uuid::new_v4();
    repos::wind_rasters::create(&client, &raster_id, grib_data.into()).await?;

    let report = WindReport {
        id,
        raster_id,
        url,
        day,
        hour,
        forecast,
        target_time,
        creation_time: Utc::now(),
    };

    repos::wind_reports::create(&client, &report).await?;

    println!("ok");
    Ok(())
}

async fn save_grib(s3: &aws::AmazonS3, filename: &str, grib_data: Bytes) -> anyhow::Result<()> {
    s3.put(&filename.into(), grib_data.into()).await?;
    Ok(())
}

async fn read_grib(s3: &aws::AmazonS3, filename: &str) -> anyhow::Result<Bytes> {
    Ok(s3.get(&filename.into()).await?.bytes().await?)
}

async fn download_grib(url: &str) -> anyhow::Result<Bytes> {
    let response = reqwest::get(url).await?;

    let bytes = match response.status() {
        reqwest::StatusCode::OK => response.bytes().await?,
        reqwest::StatusCode::NOT_FOUND => {
            println!("GRIB download failed with: 404 Not Found");
            return Ok(Bytes::new());
        }
        status => {
            return Err(anyhow!(format!(
                "GRIB download failed with status: {}",
                status
            )))
        }
    };

    Ok(bytes)
}

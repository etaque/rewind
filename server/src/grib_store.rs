use crate::cli::GribRangeArgs;
use crate::grib_png::grib_to_uv_png;
use crate::manifest::{Manifest, WindReport};
use crate::s3;
use anyhow::anyhow;
use bytes::Bytes;
use chrono::{Days, NaiveDate, TimeDelta};
use object_store::{aws, ObjectStoreExt};

// Hours of the day when GRIB files are generated (0, 6, 12, 18)
const HOURS: [i16; 4] = [0, 6, 12, 18];
// Forecast offsets in hours (3, 6)
const FORECASTS: [i16; 2] = [3, 6];

const BASE_URL: &str = "https://grib.v-l-m.org/archives";

/// Import all GRIB files for a date range
pub async fn import_grib_range(args: GribRangeArgs) -> anyhow::Result<()> {
    let grib_s3 = s3::grib_client();
    let raster_s3 = s3::raster_client();

    // Load existing manifest
    let mut manifest = Manifest::load().await?;
    println!("Loaded manifest with {} reports", manifest.reports.len());

    let mut current_day = args.from;
    let end_day = args.to.checked_add_days(Days::new(1)).unwrap();

    while current_day < end_day {
        for hour in HOURS {
            for forecast in FORECASTS {
                handle_grib(
                    &mut manifest,
                    &grib_s3,
                    &raster_s3,
                    current_day,
                    hour,
                    forecast,
                )
                .await?;
            }
        }
        current_day = current_day.checked_add_days(Days::new(1)).unwrap();
    }

    // Save updated manifest
    manifest.save().await?;
    println!("Saved manifest with {} reports", manifest.reports.len());

    println!("Finished.");
    Ok(())
}

/// S3 path for a UV PNG raster
fn raster_path(day: NaiveDate, hour: i16, forecast: i16) -> String {
    format!("{}/{}/{}/uv.png", day.format("%Y/%m%d"), hour, forecast)
}

/// GRIB path within the day folder
fn grib_path(day: NaiveDate, hour: i16, forecast: i16) -> String {
    format!(
        "{}/gfs.t{:02}z.pgrb2full.0p50.f{:03}.grib2",
        day.format("%Y/%m%d"),
        hour,
        forecast
    )
}

async fn handle_grib(
    manifest: &mut Manifest,
    grib_s3: &aws::AmazonS3,
    raster_s3: &aws::AmazonS3,
    day: NaiveDate,
    hour: i16,
    forecast: i16,
) -> anyhow::Result<()> {
    let target_time =
        day.and_hms_opt(hour as u32, 0, 0).unwrap().and_utc() + TimeDelta::hours(forecast.into());

    // Check if already in manifest
    if manifest.reports.iter().any(|r| r.time == target_time) {
        println!(
            "  {} ... skipped (already exists)",
            grib_path(day, hour, forecast)
        );
        return Ok(());
    }

    let grib_path = grib_path(day, hour, forecast);
    let url = format!("{}/{}", BASE_URL, grib_path);

    print!("  {} ... ", grib_path);

    // Try to read GRIB from S3 cache, otherwise download
    let grib_data = match grib_s3.get(&grib_path.as_str().into()).await {
        Ok(result) => result.bytes().await?,
        Err(_) => match download_grib(&url).await {
            Ok(data) if data.is_empty() => {
                println!("skipped (not found)");
                return Ok(());
            }
            Ok(data) => {
                grib_s3
                    .put(&grib_path.as_str().into(), data.clone().into())
                    .await?;
                data
            }
            Err(e) => {
                println!("error: {}", e);
                return Ok(());
            }
        },
    };

    // Generate UV PNG from GRIB
    let png_data = grib_to_uv_png(&grib_data)?;
    let png_path = raster_path(day, hour, forecast);
    raster_s3
        .put(&png_path.as_str().into(), png_data.into())
        .await?;

    let report = WindReport {
        time: target_time,
        grib_path,
        png_path,
    };

    manifest.add_report(report);

    println!("ok");
    Ok(())
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

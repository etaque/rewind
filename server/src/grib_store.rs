use crate::cli::GribRangeArgs;
use crate::db;
use crate::models::WindReport;
use crate::repos;
use anyhow::anyhow;
use chrono::{Days, NaiveDate, TimeDelta, Utc};
use object_store::{local::LocalFileSystem, path::Path, ObjectStoreExt};
use reqwest;
use std::env;
use uuid::Uuid;

fn gribs_dir() -> String {
    env::var("REWIND_GRIBS_DIR").unwrap_or_else(|_| "./gribs".to_string())
}

// Hours of the day when GRIB files are generated (0, 6, 12, 18)
const HOURS: [i16; 4] = [0, 6, 12, 18];
// Forecast offsets in hours (3, 6)
const FORECASTS: [i16; 2] = [3, 6];

/// Import all GRIB files for a date range
pub async fn import_grib_range(db_url: &str, args: GribRangeArgs) -> anyhow::Result<()> {
    let pool = db::pool(db_url).await?;
    let gribs_dir = gribs_dir();
    std::fs::create_dir_all(&gribs_dir)?;
    let fs = LocalFileSystem::new_with_prefix(&gribs_dir)?;

    let mut current_day = args.from;
    let end_day = args.to.checked_add_days(Days::new(1)).unwrap();

    while current_day < end_day {
        let day_path = current_day.format("%Y/%m%d");
        println!("{}/{}/", args.base_url, day_path);

        for hour in HOURS {
            for forecast in FORECASTS {
                let filename = format!("gfs.t{:02}z.pgrb2full.0p50.f{:03}.grib2", hour, forecast);
                let url = format!("{}/{}/{}", args.base_url, day_path, filename);

                print!("  {} ... ", filename);

                let grib_data = match download_grib(&url).await {
                    Ok(data) if data.is_empty() => {
                        println!("skipped (not found)");
                        continue;
                    }
                    Ok(data) => data,
                    Err(e) => {
                        println!("error: {}", e);
                        continue;
                    }
                };

                let id = Uuid::new_v4();
                let local_filename = make_filename(id, current_day, hour, forecast);
                save_grib(&fs, &local_filename, grib_data.clone()).await?;

                let client = pool.get().await?;

                let target_time = current_day
                    .and_hms_opt(hour as u32, 0, 0)
                    .unwrap()
                    .and_utc()
                    + TimeDelta::hours(forecast.into());

                let raster_id = Uuid::new_v4();
                repos::wind_rasters::create(&client, &raster_id, grib_data).await?;

                let report = WindReport {
                    id,
                    raster_id,
                    url,
                    day: current_day,
                    hour,
                    forecast,
                    target_time,
                    creation_time: Utc::now(),
                };

                repos::wind_reports::create(&client, &report).await?;

                println!("ok");
            }
        }

        current_day = current_day.checked_add_days(Days::new(1)).unwrap();
    }

    println!("Finished.");
    Ok(())
}

async fn save_grib(fs: &LocalFileSystem, filename: &str, grib_data: Vec<u8>) -> anyhow::Result<()> {
    fs.put(&Path::from(filename), grib_data.into()).await?;
    Ok(())
}

async fn download_grib(url: &str) -> anyhow::Result<Vec<u8>> {
    let response = reqwest::get(url).await?;

    let bytes = match response.status() {
        reqwest::StatusCode::OK => response.bytes().await?,
        reqwest::StatusCode::NOT_FOUND => {
            println!("GRIB download failed with: 404 Not Found");
            return Ok(vec![]);
        }
        status => {
            return Err(anyhow!(format!(
                "GRIB download failed with status: {}",
                status
            )))
        }
    };

    Ok(bytes.into())
}

fn make_filename(id: Uuid, day: NaiveDate, hour: i16, forecast: i16) -> String {
    format!("{}.{}-{}-{}.grib", id, day, hour, forecast)
}

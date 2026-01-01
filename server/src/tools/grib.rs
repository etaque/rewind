use crate::cli::GribArgs;
use crate::db;
use crate::models::WindReport;
use crate::repos;
use anyhow::anyhow;
use chrono::{TimeDelta, Utc};
use reqwest;
use std::io::{copy, Cursor};
use uuid::Uuid;

pub async fn exec(db_url: &str, args: GribArgs) -> anyhow::Result<()> {
    let response = reqwest::get(&args.url).await?;

    let bytes = match response.status() {
        reqwest::StatusCode::OK => response.bytes().await?,
        reqwest::StatusCode::NOT_FOUND => {
            println!("GRIB download failed with: 404 Not Found");
            return Ok(());
        }
        status => {
            return Err(anyhow!(format!(
                "GRIB download failed with status: {}",
                status
            )))
        }
    };

    let mut content = Cursor::new(bytes);
    let mut tmp = tempfile::NamedTempFile::new()?;
    copy(&mut content, &mut tmp)?;
    let path = tmp.into_temp_path().keep()?;

    let pool = db::pool(db_url).await?;
    let client = pool.get().await?;

    let target_time = args
        .day
        .and_hms_opt(args.hour as u32, 0, 0)
        .unwrap()
        .and_utc()
        + TimeDelta::hours(args.forecast.into());

    let raster_id = Uuid::new_v4();
    repos::wind_rasters::create(&client, &raster_id, &path).await?;

    let report = WindReport {
        id: Uuid::new_v4(),
        raster_id,
        url: args.url,
        day: args.day,
        hour: args.hour,
        forecast: args.forecast,
        target_time,
        creation_time: Utc::now(),
    };

    repos::wind_reports::create(&client, &report).await?;

    if !args.silent {
        println!("{:#?}", report);
    }
    Ok(())
}

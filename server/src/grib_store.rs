use crate::cli::{DataSource, GribRangeArgs};
use crate::courses;
use crate::grib_png::grib_to_uv_png;
use crate::ncar_source::{NCAR_HOURS, NcarSource, ncar_grib_path, ncar_raster_path};
use crate::s3;
use crate::wind_reports::{self, WindReport};
use anyhow::anyhow;
use bytes::Bytes;
use chrono::{DateTime, Days, NaiveDate, TimeDelta, Utc};
use object_store::{ObjectStoreExt, aws};

// Hours of the day when GRIB files are generated (0, 6, 12, 18)
const HOURS: [i16; 4] = [0, 6, 12, 18];
// Forecast offsets in hours (3, 6)
const FORECASTS: [i16; 2] = [3, 6];

const BASE_URL: &str = "https://grib.v-l-m.org/archives";

/// Import all GRIB files for a date range
pub async fn import_grib_range(args: GribRangeArgs) -> anyhow::Result<()> {
    match args.source {
        DataSource::Vlm => import_grib_range_vlm(args.from, args.to).await,
        DataSource::Ncar => import_grib_range_ncar(args.from, args.to).await,
    }
}

/// Import GRIB files from VLM.org (0.5° resolution)
async fn import_grib_range_vlm(from: NaiveDate, to: NaiveDate) -> anyhow::Result<()> {
    let grib_s3 = s3::grib_client();
    let raster_s3 = s3::raster_client();

    let report_count = wind_reports::get_report_count()?;
    println!("Database has {} reports", report_count);

    let mut current_day = from;
    let end_day = to.checked_add_days(Days::new(1)).unwrap();

    while current_day < end_day {
        for hour in HOURS {
            for forecast in FORECASTS {
                handle_grib(&grib_s3, &raster_s3, current_day, hour, forecast).await?;
            }
        }
        current_day = current_day.checked_add_days(Days::new(1)).unwrap();
    }

    let report_count = wind_reports::get_report_count()?;
    println!("Database now has {} reports", report_count);

    println!("Finished.");
    Ok(())
}

/// Import GRIB files from NCAR THREDDS (0.25° resolution)
async fn import_grib_range_ncar(from: NaiveDate, to: NaiveDate) -> anyhow::Result<()> {
    let grib_s3 = s3::grib_client();
    let raster_s3 = s3::raster_client();
    let ncar = NcarSource::new();

    let report_count = wind_reports::get_report_count()?;
    println!("Database has {} reports", report_count);
    println!("Using NCAR THREDDS source (0.25° resolution)");

    let mut current_day = from;
    let end_day = to.checked_add_days(Days::new(1)).unwrap();

    while current_day < end_day {
        for hour in NCAR_HOURS {
            handle_ncar_grib(&ncar, &grib_s3, &raster_s3, current_day, hour).await?;
        }
        current_day = current_day.checked_add_days(Days::new(1)).unwrap();
    }

    let report_count = wind_reports::get_report_count()?;
    println!("Database now has {} reports", report_count);

    println!("Finished.");
    Ok(())
}

/// Handle a single NCAR GRIB file: download, filter, convert to PNG, store
async fn handle_ncar_grib(
    ncar: &NcarSource,
    grib_s3: &aws::AmazonS3,
    raster_s3: &aws::AmazonS3,
    day: NaiveDate,
    hour: u32,
) -> anyhow::Result<()> {
    let target_time = day.and_hms_opt(hour, 0, 0).unwrap().and_utc();

    // Check if already in database
    if wind_reports::report_exists(target_time)? {
        println!("  {} hour {:02} ... skipped (already exists)", day, hour);
        return Ok(());
    }

    print!("  {} hour {:02} ... ", day, hour);

    let grib_path = ncar_grib_path(day, hour);

    // Check if filtered GRIB already exists in S3 cache
    let grib_data = match grib_s3.get(&grib_path.as_str().into()).await {
        Ok(result) => {
            println!("using cached GRIB");
            result.bytes().await?
        }
        Err(_) => {
            // Download and filter from NCAR
            let bytes_uploaded = ncar
                .download_wind_data(day, hour, grib_s3, &grib_path)
                .await?;

            if bytes_uploaded == 0 {
                println!("skipped (not found or no wind data)");
                return Ok(());
            }

            // Read back the uploaded data for PNG conversion
            grib_s3
                .get(&grib_path.as_str().into())
                .await?
                .bytes()
                .await?
        }
    };

    // Generate UV PNG from filtered GRIB
    let png_data = grib_to_uv_png(&grib_data)?;
    let png_path = ncar_raster_path(day, hour);
    raster_s3
        .put(&png_path.as_str().into(), png_data.into())
        .await?;

    let report = WindReport {
        time: target_time,
        grib_path,
        png_path,
    };

    wind_reports::insert_wind_report(&report)?;

    println!("ok");
    Ok(())
}

/// Import GRIB files for all courses (1 day before start to max_days after)
pub async fn import_courses_gribs(source: DataSource) -> anyhow::Result<()> {
    for course in courses::all() {
        println!("Importing GRIBs for course: {}", course.name);

        // Convert start_time (ms) to DateTime
        let start_time = DateTime::<Utc>::from_timestamp_millis(course.start_time)
            .ok_or_else(|| anyhow!("Invalid start_time for course {}", course.key))?;

        // Start 1 day before, end at max_days after start
        let from = start_time.date_naive() - Days::new(1);
        let to = start_time.date_naive() + Days::new(course.max_days as u64);

        println!("  Date range: {} to {}", from, to);

        let args = GribRangeArgs {
            from,
            to,
            source: source.clone(),
        };
        import_grib_range(args).await?;
    }

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
    grib_s3: &aws::AmazonS3,
    raster_s3: &aws::AmazonS3,
    day: NaiveDate,
    hour: i16,
    forecast: i16,
) -> anyhow::Result<()> {
    let target_time =
        day.and_hms_opt(hour as u32, 0, 0).unwrap().and_utc() + TimeDelta::hours(forecast.into());

    // Check if already in database
    if wind_reports::report_exists(target_time)? {
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

    wind_reports::insert_wind_report(&report)?;

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
            )));
        }
    };

    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // raster_path tests
    // =========================================================================

    #[test]
    fn test_raster_path_basic() {
        let day = NaiveDate::from_ymd_opt(2020, 11, 1).unwrap();
        let path = raster_path(day, 0, 3);
        assert_eq!(path, "2020/1101/0/3/uv.png");
    }

    #[test]
    fn test_raster_path_different_hours() {
        let day = NaiveDate::from_ymd_opt(2020, 11, 15).unwrap();

        assert_eq!(raster_path(day, 0, 3), "2020/1115/0/3/uv.png");
        assert_eq!(raster_path(day, 6, 3), "2020/1115/6/3/uv.png");
        assert_eq!(raster_path(day, 12, 6), "2020/1115/12/6/uv.png");
        assert_eq!(raster_path(day, 18, 6), "2020/1115/18/6/uv.png");
    }

    #[test]
    fn test_raster_path_single_digit_month() {
        let day = NaiveDate::from_ymd_opt(2020, 1, 5).unwrap();
        let path = raster_path(day, 0, 3);
        // Month should be zero-padded to 2 digits
        assert_eq!(path, "2020/0105/0/3/uv.png");
    }

    #[test]
    fn test_raster_path_end_of_year() {
        let day = NaiveDate::from_ymd_opt(2020, 12, 31).unwrap();
        let path = raster_path(day, 18, 6);
        assert_eq!(path, "2020/1231/18/6/uv.png");
    }

    // =========================================================================
    // grib_path tests
    // =========================================================================

    #[test]
    fn test_grib_path_basic() {
        let day = NaiveDate::from_ymd_opt(2020, 11, 1).unwrap();
        let path = grib_path(day, 0, 3);
        // Note: grib_path doesn't include hour as separate segment (unlike raster_path)
        assert_eq!(path, "2020/1101/gfs.t00z.pgrb2full.0p50.f003.grib2");
    }

    #[test]
    fn test_grib_path_hour_padding() {
        let day = NaiveDate::from_ymd_opt(2020, 11, 1).unwrap();

        // Hour 0 should be padded to 00
        assert!(grib_path(day, 0, 3).contains("t00z"));
        // Hour 6 should be padded to 06
        assert!(grib_path(day, 6, 3).contains("t06z"));
        // Hour 12 stays as 12
        assert!(grib_path(day, 12, 3).contains("t12z"));
    }

    #[test]
    fn test_grib_path_forecast_padding() {
        let day = NaiveDate::from_ymd_opt(2020, 11, 1).unwrap();

        // Forecast 3 should be padded to 003
        assert!(grib_path(day, 0, 3).contains("f003"));
        // Forecast 6 should be padded to 006
        assert!(grib_path(day, 0, 6).contains("f006"));
    }

    #[test]
    fn test_grib_path_all_standard_hours() {
        let day = NaiveDate::from_ymd_opt(2020, 11, 1).unwrap();

        for hour in HOURS {
            for forecast in FORECASTS {
                let path = grib_path(day, hour, forecast);
                // Verify path format is valid
                assert!(path.starts_with("2020/1101/"));
                assert!(path.ends_with(".grib2"));
                assert!(path.contains("gfs.t"));
                assert!(path.contains("z.pgrb2full.0p50.f"));
            }
        }
    }

    // =========================================================================
    // Path consistency tests
    // =========================================================================

    #[test]
    fn test_raster_and_grib_paths_share_prefix() {
        let day = NaiveDate::from_ymd_opt(2020, 11, 15).unwrap();

        let raster = raster_path(day, 12, 6);
        let grib = grib_path(day, 12, 6);

        // Both should start with same date prefix
        assert!(raster.starts_with("2020/1115/"));
        assert!(grib.starts_with("2020/1115/"));
    }
}

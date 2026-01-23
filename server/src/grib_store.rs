use crate::cli::GribRangeArgs;
use crate::courses;
use crate::grib_png::grib_to_uv_png;
use crate::ncar_source::{NCAR_HOURS, NcarSource, ncar_grib_path, ncar_raster_path};
use crate::s3;
use crate::wind_reports::{self, SOURCE_NCAR, WindReport};
use anyhow::anyhow;
use chrono::{DateTime, Days, NaiveDate, Utc};
use object_store::{ObjectStoreExt, aws};

/// Import all GRIB files for a date range from NCAR
pub async fn import_grib_range(args: GribRangeArgs) -> anyhow::Result<()> {
    let grib_s3 = s3::grib_client();
    let raster_s3 = s3::raster_client();
    let ncar = NcarSource::new();

    let report_count = wind_reports::get_report_count()?;
    println!("Database has {} reports", report_count);
    println!("Using NCAR THREDDS source (0.25° resolution)");

    let mut current_day = args.from;
    let end_day = args.to.checked_add_days(Days::new(1)).unwrap();

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

            if bytes_uploaded.is_none() {
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
        source: SOURCE_NCAR.to_string(),
    };

    wind_reports::insert_wind_report(&report)?;

    println!("ok");
    Ok(())
}

/// Import GRIB files for all courses (1 day before start to max_days after)
pub async fn import_courses_gribs() -> anyhow::Result<()> {
    for course in courses::all() {
        println!("Importing GRIBs for course: {}", course.name);

        // Convert start_time (ms) to DateTime
        let start_time = DateTime::<Utc>::from_timestamp_millis(course.start_time)
            .ok_or_else(|| anyhow!("Invalid start_time for course {}", course.key))?;

        // Start 1 day before, end at max_days after start
        let from = start_time.date_naive() - Days::new(1);
        let to = start_time.date_naive() + Days::new(course.max_days as u64);

        println!("  Date range: {} to {}", from, to);

        let args = GribRangeArgs { from, to };
        import_grib_range(args).await?;
    }

    Ok(())
}

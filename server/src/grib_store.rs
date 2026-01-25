use crate::grib_png::grib_to_uv_png;
use crate::ncar_source::{NCAR_HOURS, NcarSource, ncar_grib_path, ncar_raster_path};
use crate::s3;
use crate::wind_reports;
use chrono::{Days, NaiveDate};
use futures::stream::{self, StreamExt};
use object_store::{ObjectStoreExt, aws};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Import all GRIB files for a date range from NCAR
pub async fn import_grib_range(
    from: NaiveDate,
    to: NaiveDate,
    max_concurrency: usize,
) -> anyhow::Result<()> {
    let grib_s3 = Arc::new(s3::grib_client());
    let raster_s3 = Arc::new(s3::raster_client());
    let ncar = Arc::new(NcarSource::new());

    println!("Using NCAR THREDDS source (0.25° resolution)");

    // Get existing report times by listing S3 rasters bucket (stateless)
    println!("Checking existing rasters in S3...");
    let existing_times = wind_reports::get_existing_times_from_s3().await?;
    println!("Found {} existing rasters in S3", existing_times.len());

    let end_day = to.checked_add_days(Days::new(1)).unwrap();

    // Collect (day, hour) pairs that need processing
    let mut tasks: Vec<(NaiveDate, u32)> = Vec::new();
    let mut current_day = from;
    let mut skipped_count = 0;

    while current_day < end_day {
        for hour in NCAR_HOURS {
            let time = current_day.and_hms_opt(hour, 0, 0).unwrap().and_utc();
            if existing_times.contains(&time.timestamp_millis()) {
                skipped_count += 1;
            } else {
                tasks.push((current_day, hour));
            }
        }
        current_day = current_day.checked_add_days(Days::new(1)).unwrap();
    }

    let total_tasks = tasks.len();
    if skipped_count > 0 {
        println!("Skipping {} existing reports", skipped_count);
    }
    if total_tasks == 0 {
        println!("Nothing to import.");
        return Ok(());
    }

    println!(
        "Processing {} files with concurrency {}",
        total_tasks, max_concurrency
    );

    // Track progress with atomic counter
    let completed = Arc::new(AtomicUsize::new(0));
    let error_count = Arc::new(AtomicUsize::new(0));

    // Process tasks with bounded concurrency
    let results: Vec<anyhow::Result<()>> = stream::iter(tasks)
        .map(|(day, hour)| {
            let ncar = Arc::clone(&ncar);
            let grib_s3 = Arc::clone(&grib_s3);
            let raster_s3 = Arc::clone(&raster_s3);
            let completed = Arc::clone(&completed);
            let error_count = Arc::clone(&error_count);

            async move {
                let result = handle_ncar_grib(&ncar, &grib_s3, &raster_s3, day, hour).await;

                let done = completed.fetch_add(1, Ordering::Relaxed) + 1;

                match &result {
                    Ok(_) => {
                        println!("[{}/{}] {} h{:02} - done", done, total_tasks, day, hour);
                    }
                    Err(e) => {
                        error_count.fetch_add(1, Ordering::Relaxed);
                        eprintln!(
                            "[{}/{}] {} h{:02} - error: {}",
                            done, total_tasks, day, hour, e
                        );
                    }
                }

                result
            }
        })
        .buffer_unordered(max_concurrency)
        .collect()
        .await;

    // Count errors
    let total_errors = results.iter().filter(|r| r.is_err()).count();

    println!();
    if total_errors > 0 {
        println!(
            "Finished with {} errors out of {} tasks",
            total_errors, total_tasks
        );
    } else {
        println!("Finished successfully: {} files processed", total_tasks);
    }
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
    let grib_path = ncar_grib_path(day, hour);

    // Check if filtered GRIB already exists in S3 cache
    let grib_data = match grib_s3.get(&grib_path.as_str().into()).await {
        Ok(result) => {
            log::debug!("{} h{:02} - using cached GRIB", day, hour);
            result.bytes().await?
        }
        Err(_) => {
            log::debug!("{} h{:02} - downloading from NCAR", day, hour);
            // Download and filter from NCAR
            let bytes_uploaded = ncar
                .download_wind_data(day, hour, grib_s3, &grib_path)
                .await?;

            if bytes_uploaded.is_none() {
                log::warn!("{} h{:02} - GRIB not found on NCAR", day, hour);
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

    Ok(())
}

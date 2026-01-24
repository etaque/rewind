use crate::grib_png::grib_to_uv_png;
use crate::ncar_source::{NCAR_HOURS, NcarSource, ncar_grib_path, ncar_raster_path};
use crate::s3;
use crate::wind_reports::{self, SOURCE_NCAR, WindReport};
use chrono::{Days, NaiveDate};
use futures::stream::{self, StreamExt};
use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use object_store::{ObjectStoreExt, aws};
use std::sync::Arc;

/// Import all GRIB files for a date range from NCAR
pub async fn import_grib_range(
    from: NaiveDate,
    to: NaiveDate,
    max_concurrency: usize,
) -> anyhow::Result<()> {
    let grib_s3 = Arc::new(s3::grib_client());
    let raster_s3 = Arc::new(s3::raster_client());
    let ncar = Arc::new(NcarSource::new());

    let report_count = wind_reports::get_report_count()?;
    println!("Database has {} reports", report_count);
    println!("Using NCAR THREDDS source (0.25° resolution)");

    // Get existing report times to filter out already-imported files
    let from_time = from.and_hms_opt(0, 0, 0).unwrap().and_utc();
    let end_day = to.checked_add_days(Days::new(1)).unwrap();
    let to_time = end_day.and_hms_opt(0, 0, 0).unwrap().and_utc();
    let existing_times = wind_reports::get_existing_times(from_time, to_time)?;

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

    let multi_progress = Arc::new(MultiProgress::new());

    // Global progress bar (total files)
    let global_pb = multi_progress.add(ProgressBar::new(total_tasks as u64));
    global_pb.set_style(
        ProgressStyle::default_bar()
            .template("[{bar:40.green/dim}] {pos}/{len} files ({eta} remaining)")
            .expect("Invalid progress style template")
            .progress_chars("=>-"),
    );
    // Tick to force initial render
    global_pb.tick();
    let global_pb = Arc::new(global_pb);

    // Process tasks with bounded concurrency
    let results: Vec<anyhow::Result<()>> = stream::iter(tasks)
        .map(|(day, hour)| {
            let ncar = Arc::clone(&ncar);
            let grib_s3 = Arc::clone(&grib_s3);
            let raster_s3 = Arc::clone(&raster_s3);
            let mp = Arc::clone(&multi_progress);
            let gpb = Arc::clone(&global_pb);

            async move {
                let result =
                    handle_ncar_grib(&ncar, &grib_s3, &raster_s3, day, hour, &mp, &gpb).await;
                gpb.inc(1);
                result
            }
        })
        .buffer_unordered(max_concurrency)
        .collect()
        .await;

    global_pb.finish_and_clear();

    // Check for errors
    let mut error_count = 0;
    for result in results {
        if let Err(e) = result {
            error_count += 1;
            eprintln!("Error: {}", e);
        }
    }

    println!();
    let report_count = wind_reports::get_report_count()?;
    println!("Database now has {} reports", report_count);

    if error_count > 0 {
        println!("Finished with {} errors.", error_count);
    } else {
        println!("Finished.");
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
    multi_progress: &MultiProgress,
    global_pb: &ProgressBar,
) -> anyhow::Result<()> {
    let target_time = day.and_hms_opt(hour, 0, 0).unwrap().and_utc();
    let label = format!("{} h{:02}", day, hour);

    // Insert after global progress bar to keep it at the top
    let pb = multi_progress.insert_after(global_pb, ProgressBar::new(100));
    pb.set_style(progress_style_downloading());
    pb.set_prefix(label.clone());
    pb.set_message("checking cache...");

    let grib_path = ncar_grib_path(day, hour);

    // Check if filtered GRIB already exists in S3 cache
    let grib_data = match grib_s3.get(&grib_path.as_str().into()).await {
        Ok(result) => {
            pb.set_message("using cached GRIB");
            result.bytes().await?
        }
        Err(_) => {
            pb.set_message("downloading...");
            // Download and filter from NCAR
            let bytes_uploaded = ncar
                .download_wind_data(day, hour, grib_s3, &grib_path, &pb)
                .await?;

            if bytes_uploaded.is_none() {
                pb.finish_and_clear();
                return Ok(());
            }

            // Read back the uploaded data for PNG conversion
            pb.set_message("reading from S3...");
            grib_s3
                .get(&grib_path.as_str().into())
                .await?
                .bytes()
                .await?
        }
    };

    // Generate UV PNG from filtered GRIB
    pb.set_message("converting to PNG...");
    let png_data = grib_to_uv_png(&grib_data)?;
    let png_path = ncar_raster_path(day, hour);

    pb.set_message("uploading PNG...");
    raster_s3
        .put(&png_path.as_str().into(), png_data.into())
        .await?;

    let report = WindReport {
        time: target_time,
        grib_path,
        png_path,
        source: SOURCE_NCAR.to_string(),
    };

    wind_reports::upsert_wind_report(&report)?;

    pb.finish_and_clear();

    Ok(())
}

fn progress_style_downloading() -> ProgressStyle {
    ProgressStyle::default_bar()
        .template("{prefix:>15} [{bar:30.cyan/blue}] {percent:>3}% {msg}")
        .expect("Invalid progress style template")
        .progress_chars("=>-")
}

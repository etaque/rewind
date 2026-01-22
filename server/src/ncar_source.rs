//! NCAR THREDDS data source for downloading GFS wind data.
//!
//! Downloads GFS 0.25° resolution data from NCAR's Research Data Archive (ds084.1),
//! streaming and filtering for wind components only.

use crate::grib_stream::{Grib2StreamParser, is_wind_message};
use crate::s3_multipart::S3MultipartUploader;
use anyhow::Result;
use chrono::NaiveDate;
use futures::StreamExt;
use object_store::aws::AmazonS3;
use rand::Rng;
use std::io::{self, Write};
use std::time::Duration;
use tokio::time::sleep;

/// NCAR THREDDS base URL for GFS 0.25° data (ds084.1 dataset).
const NCAR_BASE_URL: &str = "https://thredds.rda.ucar.edu/thredds/fileServer/files/g/d084001";

/// Hours of the day when GFS analysis files are available (00, 06, 12, 18 UTC).
pub const NCAR_HOURS: [u32; 4] = [0, 6, 12, 18];

/// Maximum number of retry attempts for NCAR downloads.
const MAX_RETRIES: u32 = 4;

/// Base delay for exponential backoff (2 seconds).
const BASE_DELAY_MS: u64 = 2000;

/// Maximum jitter to add to backoff delay (as fraction of delay, e.g., 0.25 = ±25%).
const JITTER_FACTOR: f64 = 0.25;

/// NCAR data source for streaming wind data downloads.
pub struct NcarSource {
    client: reqwest::Client,
}

impl NcarSource {
    /// Create a new NCAR source with default HTTP client settings.
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .build()
            .expect("Failed to create HTTP client");

        Self { client }
    }

    /// Build the URL for a specific date and hour.
    ///
    /// URL format: `{BASE}/{year}/{date}/gfs.0p25.{date}{hour:02}.f000.grib2`
    /// Example: `https://thredds.rda.ucar.edu/.../2024/20240101/gfs.0p25.2024010100.f000.grib2`
    pub fn build_url(date: NaiveDate, hour: u32) -> String {
        let date_str = date.format("%Y%m%d").to_string();
        let year = date.format("%Y").to_string();
        format!(
            "{}/{}/{}/gfs.0p25.{}{:02}.f000.grib2",
            NCAR_BASE_URL, year, date_str, date_str, hour
        )
    }

    /// Calculate backoff delay with jitter for a given attempt.
    ///
    /// Uses exponential backoff: base_delay * 2^attempt
    /// Adds random jitter of ±JITTER_FACTOR to prevent thundering herd.
    fn backoff_with_jitter(attempt: u32) -> Duration {
        let base_delay = BASE_DELAY_MS * 2u64.pow(attempt);
        let jitter_range = (base_delay as f64 * JITTER_FACTOR) as u64;
        let jitter = rand::rng().random_range(0..=jitter_range * 2) as i64 - jitter_range as i64;
        let delay_ms = (base_delay as i64 + jitter).max(0) as u64;
        Duration::from_millis(delay_ms)
    }

    /// Stream download GFS data, filter for wind components, and upload to S3.
    ///
    /// Returns the number of bytes uploaded (filtered wind data only).
    /// Returns Ok(0) if the file is not found (404).
    ///
    /// Uses exponential backoff with jitter for retrying on network errors
    /// and server errors (5xx). Will retry up to MAX_RETRIES times.
    /// Retries cover both the initial connection and mid-stream failures.
    pub async fn download_wind_data(
        &self,
        date: NaiveDate,
        hour: u32,
        s3_client: &AmazonS3,
        s3_key: &str,
    ) -> Result<usize> {
        let url = Self::build_url(date, hour);
        let mut last_error = None;

        for attempt in 0..=MAX_RETRIES {
            if attempt > 0 {
                let delay = Self::backoff_with_jitter(attempt - 1);
                log::warn!(
                    "Retry attempt {}/{} for {} after {:?}",
                    attempt,
                    MAX_RETRIES,
                    url,
                    delay
                );
                print!("\r  Retrying ({}/{})...", attempt, MAX_RETRIES);
                let _ = io::stdout().flush();
                sleep(delay).await;
            }

            match self
                .try_download_wind_data(&url, s3_client, s3_key)
                .await
            {
                Ok(result) => return Ok(result),
                Err(DownloadError::NotFound) => {
                    log::info!("NCAR file not found: {}", url);
                    return Ok(0);
                }
                Err(DownloadError::NonRetryable(e)) => {
                    return Err(e);
                }
                Err(DownloadError::Retryable(e)) => {
                    log::warn!("Retryable error for {}: {}", url, e);
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            anyhow::anyhow!("Failed to download {} after {} retries", url, MAX_RETRIES)
        }))
    }

    /// Attempt a single download. Returns a DownloadError to indicate retry behavior.
    async fn try_download_wind_data(
        &self,
        url: &str,
        s3_client: &AmazonS3,
        s3_key: &str,
    ) -> std::result::Result<usize, DownloadError> {
        // Initiate the HTTP request
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| DownloadError::Retryable(anyhow::anyhow!("Connection failed: {}", e)))?;

        let status = response.status();
        if status == reqwest::StatusCode::NOT_FOUND {
            return Err(DownloadError::NotFound);
        } else if status.is_server_error() {
            return Err(DownloadError::Retryable(anyhow::anyhow!(
                "Server error: {}",
                status
            )));
        } else if !status.is_success() {
            return Err(DownloadError::NonRetryable(anyhow::anyhow!(
                "HTTP error: {}",
                status
            )));
        }

        let content_length = response.content_length();

        let mut uploader = S3MultipartUploader::new(s3_client, s3_key)
            .await
            .map_err(|e| DownloadError::Retryable(anyhow::anyhow!("S3 upload init failed: {}", e)))?;

        let mut parser = Grib2StreamParser::new();
        let mut stream = response.bytes_stream();
        let mut total_downloaded: usize = 0;
        let mut total_uploaded: usize = 0;
        let mut total_messages: usize = 0;
        let mut wind_messages: usize = 0;

        // Stream and process chunks
        let stream_result: std::result::Result<(), DownloadError> = async {
            while let Some(chunk_result) = stream.next().await {
                let chunk = chunk_result.map_err(|e| {
                    DownloadError::Retryable(anyhow::anyhow!("Stream read failed: {}", e))
                })?;
                total_downloaded += chunk.len();

                // Parse chunk and extract complete GRIB messages
                let messages = parser.feed(&chunk);
                total_messages += messages.len();

                for msg in messages {
                    // Filter for wind messages only
                    if is_wind_message(&msg) {
                        uploader.write(&msg).await.map_err(|e| {
                            DownloadError::Retryable(anyhow::anyhow!("S3 write failed: {}", e))
                        })?;
                        total_uploaded += msg.len();
                        wind_messages += 1;
                    }
                }

                // In-place progress display
                if let Some(total) = content_length {
                    let pct = (total_downloaded as f64 / total as f64) * 100.0;
                    print!(
                        "\r  Downloaded: {pct:.1}% | Messages: {total_messages} total, {wind_messages} wind"
                    );
                } else {
                    print!(
                        "\r  Downloaded: {} bytes | Messages: {total_messages} total, {wind_messages} wind",
                        total_downloaded
                    );
                }
                let _ = io::stdout().flush();
            }
            Ok(())
        }
        .await;

        // Handle stream errors - abort upload and propagate
        if let Err(e) = stream_result {
            println!(); // Clear progress line
            let _ = uploader.abort().await; // Best effort abort
            return Err(e);
        }

        // Clear the progress line and print completion
        println!();

        // Complete the upload
        if total_uploaded > 0 {
            uploader
                .complete()
                .await
                .map_err(|e| DownloadError::Retryable(anyhow::anyhow!("S3 complete failed: {}", e)))?;
            println!(
                "  Completed: {} wind messages extracted from {} total ({} KB, {:.1}% of original)",
                wind_messages,
                total_messages,
                total_uploaded / 1024,
                (total_uploaded as f64 / total_downloaded as f64) * 100.0
            );
        } else {
            uploader.abort().await.map_err(|e| {
                DownloadError::Retryable(anyhow::anyhow!("S3 abort failed: {}", e))
            })?;
            println!("  No wind messages found");
        }

        Ok(total_uploaded)
    }
}

/// Internal error type to distinguish retryable vs non-retryable failures.
enum DownloadError {
    /// File not found (404) - not an error, just means file doesn't exist
    NotFound,
    /// Retryable error (network issues, server errors, mid-stream failures)
    Retryable(anyhow::Error),
    /// Non-retryable error (client errors like 4xx except 404)
    NonRetryable(anyhow::Error),
}

impl Default for NcarSource {
    fn default() -> Self {
        Self::new()
    }
}

/// S3 path for NCAR GRIB files (filtered wind data).
///
/// Path structure: `ncar/{year}/{mmdd}/{hour}/wind.grib2`
pub fn ncar_grib_path(day: NaiveDate, hour: u32) -> String {
    format!("ncar/{}/{}/wind.grib2", day.format("%Y/%m%d"), hour)
}

/// S3 path for NCAR UV PNG rasters.
///
/// Path structure: `ncar/{year}/{mmdd}/{hour}/uv.png`
pub fn ncar_raster_path(day: NaiveDate, hour: u32) -> String {
    format!("ncar/{}/{}/uv.png", day.format("%Y/%m%d"), hour)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_url() {
        let date = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let url = NcarSource::build_url(date, 6);
        assert_eq!(
            url,
            "https://thredds.rda.ucar.edu/thredds/fileServer/files/g/d084001/2024/20240115/gfs.0p25.2024011506.f000.grib2"
        );
    }

    #[test]
    fn test_build_url_hour_padding() {
        let date = NaiveDate::from_ymd_opt(2024, 1, 1).unwrap();

        let url_00 = NcarSource::build_url(date, 0);
        assert!(url_00.contains(".2024010100."));

        let url_06 = NcarSource::build_url(date, 6);
        assert!(url_06.contains(".2024010106."));

        let url_12 = NcarSource::build_url(date, 12);
        assert!(url_12.contains(".2024010112."));

        let url_18 = NcarSource::build_url(date, 18);
        assert!(url_18.contains(".2024010118."));
    }

    #[test]
    fn test_ncar_grib_path() {
        let day = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let path = ncar_grib_path(day, 6);
        assert_eq!(path, "ncar/2024/0115/6/wind.grib2");
    }

    #[test]
    fn test_ncar_raster_path() {
        let day = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let path = ncar_raster_path(day, 6);
        assert_eq!(path, "ncar/2024/0115/6/uv.png");
    }
}

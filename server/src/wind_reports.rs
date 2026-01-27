use crate::config::config;
use crate::courses::Course;
use crate::db::with_connection;
use crate::s3;
use anyhow::Result;
use chrono::serde::ts_milliseconds;
use chrono::{DateTime, NaiveDate, TimeDelta, Utc};
use futures::TryStreamExt;
use object_store::ObjectStore;
use serde::{Deserialize, Serialize};

/// GFS data source identifier
pub const SOURCE_NCAR: &str = "ncar";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindReport {
    #[serde(with = "ts_milliseconds")]
    pub time: DateTime<Utc>,
    pub grib_path: String,
    pub png_path: String,
    #[serde(default = "default_source")]
    pub source: String,
}

fn default_source() -> String {
    SOURCE_NCAR.to_string()
}

impl WindReport {
    pub fn png_url(&self) -> String {
        config().s3.raster_url(&self.png_path)
    }
}

/// Get the total count of wind reports in the database
pub fn get_report_count() -> Result<i64> {
    with_connection(|conn| {
        let count: i64 =
            conn.query_row("SELECT COUNT(*) FROM wind_reports", [], |row| row.get(0))?;
        Ok(count)
    })
}

/// Get existing report times by listing PNG files in S3 (stateless, no DB needed)
pub async fn get_existing_times_from_s3() -> Result<std::collections::HashSet<i64>> {
    let client = s3::raster_client();
    let prefix = object_store::path::Path::from("ncar");
    let objects: Vec<_> = client.list(Some(&prefix)).try_collect().await?;

    let mut times = std::collections::HashSet::new();
    for meta in objects {
        let path = meta.location.to_string();
        if !path.ends_with("/uv.png") {
            continue;
        }
        if let Some(report) = parse_ncar_png_path(&path) {
            times.insert(report.time.timestamp_millis());
        }
    }
    Ok(times)
}

/// Insert a wind report if it doesn't already exist (by time)
/// Returns true if the report was inserted, false if it already existed
pub fn upsert_wind_report(report: &WindReport) -> Result<bool> {
    with_connection(|conn| {
        let time_ms = report.time.timestamp_millis();
        let result = conn.execute(
            "INSERT INTO wind_reports (time, grib_path, png_path, source) VALUES (?, ?, ?, ?)
            ON CONFLICT(time) DO UPDATE SET grib_path=excluded.grib_path, png_path=excluded.png_path, source=excluded.source",
            (&time_ms, &report.grib_path, &report.png_path, &report.source),
        )?;
        Ok(result > 0)
    })
}

/// Get a random wind report from the database
pub fn get_random_report() -> Result<Option<WindReport>> {
    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT time, grib_path, png_path, source FROM wind_reports ORDER BY RANDOM() LIMIT 1",
        )?;

        let report = stmt
            .query_row([], |row| {
                let time_ms: i64 = row.get(0)?;
                let time =
                    DateTime::from_timestamp_millis(time_ms).unwrap_or_else(|| DateTime::UNIX_EPOCH);
                Ok(WindReport {
                    time,
                    grib_path: row.get(1)?,
                    png_path: row.get(2)?,
                    source: row.get(3)?,
                })
            })
            .ok();

        Ok(report)
    })
}

/// Get reports for a given course (within time range)
pub fn get_reports_for_course(course: &Course) -> Result<Vec<WindReport>> {
    with_connection(|conn| {
        let since = course.start_time - TimeDelta::days(1).num_milliseconds();
        let until = course.max_finish_time();

        let mut stmt = conn.prepare(
            "SELECT time, grib_path, png_path, source FROM wind_reports
             WHERE time >= ? AND time <= ?
             ORDER BY time",
        )?;

        let reports = stmt
            .query_map([since, until], |row| {
                let time_ms: i64 = row.get(0)?;
                let time = DateTime::from_timestamp_millis(time_ms)
                    .unwrap_or_else(|| DateTime::UNIX_EPOCH);
                Ok(WindReport {
                    time,
                    grib_path: row.get(1)?,
                    png_path: row.get(2)?,
                    source: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(reports)
    })
}

/// Rebuild database from S3 listing of PNG files
pub async fn rebuild_from_s3(truncate: bool) -> Result<()> {
    println!("Rebuilding DB from S3 buckets listings");
    let client = s3::raster_client();
    let mut inserted_count = 0;
    let mut skipped_count = 0;

    // Clear existing reports
    if truncate {
        println!("Truncating wind_reports...");
        with_connection(|conn| {
            conn.execute("DELETE FROM wind_reports", [])?;
            Ok(())
        })?;
        println!("Done.")
    }

    // List all objects in the raster bucket under ncar/ prefix
    let prefix = object_store::path::Path::from("ncar");
    let list = client.list(Some(&prefix));
    let objects: Vec<_> = list.try_collect().await?;

    for meta in objects {
        let path = meta.location.to_string();

        // Skip non-PNG files
        if !path.ends_with("/uv.png") {
            continue;
        }

        // Parse path: ncar/YYYY/MMDD/hour/uv.png
        match parse_ncar_png_path(&path) {
            Some(report) => {
                upsert_wind_report(&report)?;
                inserted_count += 1;
            }
            None => {
                log::warn!("Skipping PNG file with unexpected path format: {}", path);
                skipped_count += 1;
            }
        }
    }

    println!(
        "Rebuilt database: upserted {} wind reports, skipped {} files",
        inserted_count, skipped_count
    );

    Ok(())
}

/// Parse an NCAR PNG path like "ncar/2020/1101/0/uv.png" into a WindReport
fn parse_ncar_png_path(path: &str) -> Option<WindReport> {
    // Expected format: ncar/YYYY/MMDD/hour/uv.png
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() != 5 || parts[0] != "ncar" {
        return None;
    }

    let year: i32 = parts[1].parse().ok()?;
    let month: u32 = parts[2][0..2].parse().ok()?;
    let day_of_month: u32 = parts[2][2..4].parse().ok()?;
    let hour: u32 = parts[3].parse().ok()?;

    let date = NaiveDate::from_ymd_opt(year, month, day_of_month)?;
    // NCAR uses f000 (analysis), so target time = date + hour
    let target_time = date.and_hms_opt(hour, 0, 0)?.and_utc();

    // Reconstruct grib path
    let grib_path = format!(
        "ncar/{}/{:02}{:02}/{}/wind.grib2",
        year, month, day_of_month, hour
    );

    Some(WindReport {
        time: target_time,
        grib_path,
        png_path: path.to_string(),
        source: SOURCE_NCAR.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // parse_ncar_png_path tests
    // =========================================================================

    #[test]
    fn test_parse_ncar_png_path_valid() {
        let report = parse_ncar_png_path("ncar/2020/1101/0/uv.png").unwrap();

        assert_eq!(report.png_path, "ncar/2020/1101/0/uv.png");
        assert_eq!(report.grib_path, "ncar/2020/1101/0/wind.grib2");
        assert_eq!(report.source, "ncar");
        // Nov 1, 2020 00:00 UTC (NCAR uses f000, no forecast offset)
        assert_eq!(report.time.to_rfc3339(), "2020-11-01T00:00:00+00:00");
    }

    #[test]
    fn test_parse_ncar_png_path_different_hour() {
        let report = parse_ncar_png_path("ncar/2020/1115/12/uv.png").unwrap();

        assert_eq!(report.grib_path, "ncar/2020/1115/12/wind.grib2");
        // Nov 15, 2020 12:00 UTC
        assert_eq!(report.time.to_rfc3339(), "2020-11-15T12:00:00+00:00");
    }

    #[test]
    fn test_parse_ncar_png_path_leap_year() {
        let report = parse_ncar_png_path("ncar/2020/0229/6/uv.png").unwrap();

        assert_eq!(report.time.to_rfc3339(), "2020-02-29T06:00:00+00:00");
    }

    #[test]
    fn test_parse_ncar_png_path_invalid_leap_year() {
        // 2021 is not a leap year
        let result = parse_ncar_png_path("ncar/2021/0229/6/uv.png");
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_ncar_png_path_wrong_segment_count() {
        assert!(parse_ncar_png_path("ncar/2020/1101/uv.png").is_none()); // missing hour
        assert!(parse_ncar_png_path("ncar/2020/1101/0/extra/uv.png").is_none()); // too many
        assert!(parse_ncar_png_path("uv.png").is_none()); // just filename
    }

    #[test]
    fn test_parse_ncar_png_path_wrong_prefix() {
        assert!(parse_ncar_png_path("vlm/2020/1101/0/uv.png").is_none());
        assert!(parse_ncar_png_path("2020/1101/0/3/uv.png").is_none()); // old VLM format
    }

    #[test]
    fn test_parse_ncar_png_path_invalid_year() {
        assert!(parse_ncar_png_path("ncar/abcd/1101/0/uv.png").is_none());
    }

    #[test]
    fn test_parse_ncar_png_path_invalid_month() {
        assert!(parse_ncar_png_path("ncar/2020/1301/0/uv.png").is_none()); // month 13
        assert!(parse_ncar_png_path("ncar/2020/0001/0/uv.png").is_none()); // month 0
    }

    #[test]
    fn test_parse_ncar_png_path_invalid_day() {
        assert!(parse_ncar_png_path("ncar/2020/1132/0/uv.png").is_none()); // day 32
        assert!(parse_ncar_png_path("ncar/2020/1100/0/uv.png").is_none()); // day 0
    }

    #[test]
    fn test_parse_ncar_png_path_invalid_hour() {
        assert!(parse_ncar_png_path("ncar/2020/1101/25/uv.png").is_none()); // hour 25
    }
}

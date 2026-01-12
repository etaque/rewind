use crate::config::config;
use crate::s3;
use anyhow::Result;
use bytes::Bytes;
use chrono::serde::ts_milliseconds;
use chrono::{DateTime, NaiveDate, TimeDelta, Utc};
use futures::TryStreamExt;
use object_store::{ObjectStore, ObjectStoreExt};
use serde::{Deserialize, Serialize};

const MANIFEST_PATH: &str = "manifest.json";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindReport {
    #[serde(with = "ts_milliseconds")]
    pub time: DateTime<Utc>,
    pub grib_path: String,
    pub png_path: String,
}

impl WindReport {
    pub fn png_url(&self) -> String {
        config().s3.raster_url(&self.png_path)
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Manifest {
    pub reports: Vec<WindReport>,
}

impl Manifest {
    /// Load manifest from S3, returning empty manifest if not found
    pub async fn load() -> Result<Self> {
        let client = s3::raster_client();
        match client.get(&MANIFEST_PATH.into()).await {
            Ok(result) => {
                let bytes = result.bytes().await?;
                let manifest: Manifest = serde_json::from_slice(&bytes)?;
                log::info!(
                    "Loaded manifest with {} wind reports",
                    manifest.reports.len()
                );
                Ok(manifest)
            }
            Err(object_store::Error::NotFound { .. }) => {
                log::warn!(
                    "Manifest file not found in S3, returning empty manifest. \
                    Run 'rebuild-manifest' command to regenerate from existing PNG files."
                );
                Ok(Manifest::default())
            }
            Err(e) => {
                log::error!("Failed to load manifest from S3: {}", e);
                Err(e.into())
            }
        }
    }

    /// Save manifest to S3
    pub async fn save(&self) -> Result<()> {
        let client = s3::raster_client();
        let json = serde_json::to_vec_pretty(self)?;
        client
            .put(&MANIFEST_PATH.into(), Bytes::from(json).into())
            .await?;
        Ok(())
    }

    /// Add a report if it doesn't already exist (by time)
    pub fn add_report(&mut self, report: WindReport) -> bool {
        if self.reports.iter().any(|r| r.time == report.time) {
            return false;
        }
        self.reports.push(report);
        self.reports.sort_by_key(|r| r.time);
        true
    }

    /// Get reports since a given time
    pub fn reports_since(&self, since: DateTime<Utc>, limit: usize) -> Vec<&WindReport> {
        self.reports
            .iter()
            .filter(|r| r.time >= since)
            .take(limit)
            .collect()
    }

    /// Rebuild manifest from S3 listing of PNG files
    pub async fn rebuild_from_s3() -> Result<Self> {
        let client = s3::raster_client();
        let mut reports = Vec::new();
        let mut skipped_count = 0;

        // List all objects in the raster bucket
        let list = client.list(None);
        let objects: Vec<_> = list.try_collect().await?;

        for meta in objects {
            let path = meta.location.to_string();

            // Skip non-PNG files and the manifest itself
            if !path.ends_with("/uv.png") {
                continue;
            }

            // Parse path: YYYY/MMDD/hour/forecast/uv.png
            match parse_png_path(&path) {
                Some(report) => reports.push(report),
                None => {
                    log::warn!("Skipping PNG file with unexpected path format: {}", path);
                    skipped_count += 1;
                }
            }
        }

        reports.sort_by_key(|r| r.time);
        log::info!(
            "Rebuilt manifest: found {} wind reports, skipped {} files",
            reports.len(),
            skipped_count
        );

        Ok(Manifest { reports })
    }
}

/// Parse a PNG path like "2020/1101/0/3/uv.png" into a WindReport
fn parse_png_path(path: &str) -> Option<WindReport> {
    // Expected format: YYYY/MMDD/hour/forecast/uv.png
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() != 5 {
        return None;
    }

    let year: i32 = parts[0].parse().ok()?;
    let month: u32 = parts[1][0..2].parse().ok()?;
    let day_of_month: u32 = parts[1][2..4].parse().ok()?;
    let hour: i16 = parts[2].parse().ok()?;
    let forecast: i16 = parts[3].parse().ok()?;

    let date = NaiveDate::from_ymd_opt(year, month, day_of_month)?;
    let target_time =
        date.and_hms_opt(hour as u32, 0, 0)?.and_utc() + TimeDelta::hours(forecast.into());

    // Reconstruct grib path
    let grib_path = format!(
        "{}/{:02}{:02}/{}/gfs.t{:02}z.pgrb2full.0p50.f{:03}.grib2",
        year, month, day_of_month, hour, hour, forecast
    );

    Some(WindReport {
        time: target_time,
        grib_path,
        png_path: path.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // parse_png_path tests
    // =========================================================================

    #[test]
    fn test_parse_png_path_valid() {
        let report = parse_png_path("2020/1101/0/3/uv.png").unwrap();

        assert_eq!(report.png_path, "2020/1101/0/3/uv.png");
        assert_eq!(
            report.grib_path,
            "2020/1101/0/gfs.t00z.pgrb2full.0p50.f003.grib2"
        );
        // Nov 1, 2020 00:00 UTC + 3h forecast = Nov 1, 2020 03:00 UTC
        assert_eq!(report.time.to_rfc3339(), "2020-11-01T03:00:00+00:00");
    }

    #[test]
    fn test_parse_png_path_different_hour() {
        let report = parse_png_path("2020/1115/12/6/uv.png").unwrap();

        assert_eq!(
            report.grib_path,
            "2020/1115/12/gfs.t12z.pgrb2full.0p50.f006.grib2"
        );
        // Nov 15, 2020 12:00 UTC + 6h = Nov 15, 2020 18:00 UTC
        assert_eq!(report.time.to_rfc3339(), "2020-11-15T18:00:00+00:00");
    }

    #[test]
    fn test_parse_png_path_forecast_crosses_midnight() {
        // Hour 18 + forecast 6 = next day 00:00
        let report = parse_png_path("2020/1231/18/6/uv.png").unwrap();

        // Dec 31, 2020 18:00 + 6h = Jan 1, 2021 00:00
        assert_eq!(report.time.to_rfc3339(), "2021-01-01T00:00:00+00:00");
    }

    #[test]
    fn test_parse_png_path_leap_year() {
        let report = parse_png_path("2020/0229/6/3/uv.png").unwrap();

        assert_eq!(report.time.to_rfc3339(), "2020-02-29T09:00:00+00:00");
    }

    #[test]
    fn test_parse_png_path_invalid_leap_year() {
        // 2021 is not a leap year
        let result = parse_png_path("2021/0229/6/3/uv.png");
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_png_path_wrong_segment_count() {
        assert!(parse_png_path("2020/1101/0/uv.png").is_none()); // missing forecast
        assert!(parse_png_path("2020/1101/0/3/extra/uv.png").is_none()); // too many
        assert!(parse_png_path("uv.png").is_none()); // just filename
    }

    #[test]
    fn test_parse_png_path_invalid_year() {
        assert!(parse_png_path("abcd/1101/0/3/uv.png").is_none());
    }

    #[test]
    fn test_parse_png_path_invalid_month() {
        assert!(parse_png_path("2020/1301/0/3/uv.png").is_none()); // month 13
        assert!(parse_png_path("2020/0001/0/3/uv.png").is_none()); // month 0
    }

    #[test]
    fn test_parse_png_path_invalid_day() {
        assert!(parse_png_path("2020/1132/0/3/uv.png").is_none()); // day 32
        assert!(parse_png_path("2020/1100/0/3/uv.png").is_none()); // day 0
    }

    #[test]
    fn test_parse_png_path_invalid_hour() {
        assert!(parse_png_path("2020/1101/25/3/uv.png").is_none()); // hour 25
    }

    // =========================================================================
    // Manifest::add_report tests
    // =========================================================================

    fn make_report(time_str: &str, png_path: &str) -> WindReport {
        WindReport {
            time: DateTime::parse_from_rfc3339(time_str).unwrap().into(),
            grib_path: "test.grib2".to_string(),
            png_path: png_path.to_string(),
        }
    }

    #[test]
    fn test_add_report_to_empty_manifest() {
        let mut manifest = Manifest::default();
        let report = make_report("2020-11-01T03:00:00Z", "a.png");

        let added = manifest.add_report(report);

        assert!(added);
        assert_eq!(manifest.reports.len(), 1);
    }

    #[test]
    fn test_add_report_maintains_sorted_order() {
        let mut manifest = Manifest::default();

        manifest.add_report(make_report("2020-11-01T12:00:00Z", "c.png"));
        manifest.add_report(make_report("2020-11-01T03:00:00Z", "a.png"));
        manifest.add_report(make_report("2020-11-01T06:00:00Z", "b.png"));

        assert_eq!(manifest.reports.len(), 3);
        assert_eq!(manifest.reports[0].png_path, "a.png");
        assert_eq!(manifest.reports[1].png_path, "b.png");
        assert_eq!(manifest.reports[2].png_path, "c.png");
    }

    #[test]
    fn test_add_report_rejects_duplicate_time() {
        let mut manifest = Manifest::default();

        let added1 = manifest.add_report(make_report("2020-11-01T03:00:00Z", "a.png"));
        let added2 = manifest.add_report(make_report("2020-11-01T03:00:00Z", "b.png"));

        assert!(added1);
        assert!(!added2);
        assert_eq!(manifest.reports.len(), 1);
        assert_eq!(manifest.reports[0].png_path, "a.png"); // first one kept
    }

    // =========================================================================
    // Manifest::reports_since tests
    // =========================================================================

    #[test]
    fn test_reports_since_filters_by_time() {
        let mut manifest = Manifest::default();
        manifest.add_report(make_report("2020-11-01T03:00:00Z", "a.png"));
        manifest.add_report(make_report("2020-11-01T06:00:00Z", "b.png"));
        manifest.add_report(make_report("2020-11-01T09:00:00Z", "c.png"));

        let since = DateTime::parse_from_rfc3339("2020-11-01T05:00:00Z")
            .unwrap()
            .into();
        let reports = manifest.reports_since(since, 100);

        assert_eq!(reports.len(), 2);
        assert_eq!(reports[0].png_path, "b.png");
        assert_eq!(reports[1].png_path, "c.png");
    }

    #[test]
    fn test_reports_since_respects_limit() {
        let mut manifest = Manifest::default();
        manifest.add_report(make_report("2020-11-01T03:00:00Z", "a.png"));
        manifest.add_report(make_report("2020-11-01T06:00:00Z", "b.png"));
        manifest.add_report(make_report("2020-11-01T09:00:00Z", "c.png"));

        let since = DateTime::parse_from_rfc3339("2020-11-01T00:00:00Z")
            .unwrap()
            .into();
        let reports = manifest.reports_since(since, 2);

        assert_eq!(reports.len(), 2);
        assert_eq!(reports[0].png_path, "a.png");
        assert_eq!(reports[1].png_path, "b.png");
    }

    #[test]
    fn test_reports_since_includes_exact_match() {
        let mut manifest = Manifest::default();
        manifest.add_report(make_report("2020-11-01T06:00:00Z", "a.png"));

        let since = DateTime::parse_from_rfc3339("2020-11-01T06:00:00Z")
            .unwrap()
            .into();
        let reports = manifest.reports_since(since, 100);

        assert_eq!(reports.len(), 1);
    }

    #[test]
    fn test_reports_since_empty_manifest() {
        let manifest = Manifest::default();
        let since = DateTime::parse_from_rfc3339("2020-11-01T00:00:00Z")
            .unwrap()
            .into();

        let reports = manifest.reports_since(since, 100);

        assert!(reports.is_empty());
    }
}

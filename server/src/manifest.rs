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
                Ok(manifest)
            }
            Err(object_store::Error::NotFound { .. }) => Ok(Manifest::default()),
            Err(e) => Err(e.into()),
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
            if let Some(report) = parse_png_path(&path) {
                reports.push(report);
            }
        }

        reports.sort_by_key(|r| r.time);
        println!("Found {} wind reports in S3", reports.len());

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

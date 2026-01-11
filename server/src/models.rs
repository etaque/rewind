use crate::config::config;
use crate::messages;
use chrono::{DateTime, NaiveDate, Utc};
use tokio_postgres::Row;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct WindReport {
    pub id: Uuid,
    pub url: String,
    pub png_path: String,
    pub day: NaiveDate,
    pub hour: i16,
    pub forecast: i16,
    pub target_time: DateTime<Utc>,
    pub creation_time: DateTime<Utc>,
}

impl WindReport {
    /// Get the full URL to the UV PNG raster
    pub fn png_url(&self) -> String {
        config().s3.raster_url(&self.png_path)
    }
}

impl TryFrom<&Row> for WindReport {
    type Error = tokio_postgres::Error;

    fn try_from(row: &Row) -> Result<Self, Self::Error> {
        Ok(WindReport {
            id: row.try_get("id")?,
            url: row.try_get("url")?,
            png_path: row.try_get("png_path")?,
            day: row.try_get("day")?,
            hour: row.try_get("hour")?,
            forecast: row.try_get("forecast")?,
            target_time: row.try_get("target_time")?,
            creation_time: row.try_get("creation_time")?,
        })
    }
}

impl From<WindReport> for messages::WindReport {
    fn from(report: WindReport) -> messages::WindReport {
        messages::WindReport {
            id: report.id,
            time: report.target_time,
            png_url: report.png_url(),
        }
    }
}

use crate::messages;
use chrono::{DateTime, NaiveDate, Utc};
use tokio_postgres::Row;
use uuid::Uuid;

pub const SRID: i32 = 4326; // WGS 84, used by GRIB and GPS

#[derive(Clone, Debug)]
pub struct WindReport {
    pub id: Uuid,
    pub raster_id: Uuid,
    pub url: String,
    pub day: NaiveDate,
    pub hour: i16,
    pub forecast: i16,
    pub target_time: DateTime<Utc>,
    pub creation_time: DateTime<Utc>,
}

impl TryFrom<&Row> for WindReport {
    type Error = tokio_postgres::Error;

    fn try_from(row: &Row) -> Result<Self, Self::Error> {
        Ok(WindReport {
            id: row.try_get("id")?,
            raster_id: row.try_get("raster_id")?,
            url: row.try_get("url")?,
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
        }
    }
}

#[derive(Clone, Debug)]
pub enum RasterRenderingMode {
    U,
    V,
    UV,
    Speed,
}

use crate::messages;
use chrono::{DateTime, NaiveDate, Utc};
use tokio_pg_mapper_derive::PostgresMapper;
use uuid::Uuid;

pub const SRID: i32 = 4326; // WGS 84, used by GRIB and GPS

#[derive(Clone, Debug, PostgresMapper)]
#[pg_mapper(table = "wind_reports")]
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

impl Into<messages::WindReport> for WindReport {
    fn into(self) -> messages::WindReport {
        messages::WindReport {
            id: self.id,
            time: self.creation_time,
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

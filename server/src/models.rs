use chrono::{DateTime, NaiveDate, Utc};
use postgis::ewkb;
use tokio_pg_mapper_derive::PostgresMapper;

use crate::messages;
use crate::messages::LngLat;

#[derive(Clone, Debug, PostgresMapper)]
#[pg_mapper(table = "wind_reports")]
pub struct WindReport {
    pub id: i64,
    pub url: String,
    pub day: NaiveDate,
    pub hour: i16,
    pub forecast: i16,
    pub target_time: DateTime<Utc>,
    pub creation_time: DateTime<Utc>,
}

#[derive(Clone, Debug, PostgresMapper)]
#[pg_mapper(table = "wind_points")]
pub struct WindPoint {
    pub id: i64,
    pub wind_report_id: i64,
    pub point: ewkb::Point,
    pub u: f64,
    pub v: f64,
}

impl Into<messages::WindPoint> for WindPoint {
    fn into(self) -> messages::WindPoint {
        messages::WindPoint {
            position: LngLat {
                lng: self.point.x,
                lat: self.point.y,
            },
            u: self.u,
            v: self.v,
        }
    }
}

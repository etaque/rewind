use chrono::{DateTime, NaiveDate, Utc};
use postgis::ewkb;
use postgres_types::{FromSql, ToSql};
use tokio_pg_mapper_derive::PostgresMapper;

use shared::models::LngLat;

#[derive(Clone, Debug, FromSql, ToSql)]
pub struct Point {
    pub lng: f64,
    pub lat: f64,
}

impl From<LngLat> for Point {
    fn from(p: LngLat) -> Self {
        Self { lng: p.0, lat: p.1 }
    }
}

impl Into<LngLat> for Point {
    fn into(self) -> LngLat {
        LngLat(self.lng, self.lat)
    }
}

// SQL derivation
impl From<ewkb::Point> for Point {
    fn from(p: ewkb::Point) -> Self {
        Self { lng: p.x, lat: p.y }
    }
}

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
    pub point: Point,
    pub u: f64,
    pub v: f64,
}

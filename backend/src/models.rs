use chrono::{DateTime, Duration, NaiveDate, Utc};
use geo;
use postgis::ewkb;
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
use tokio_pg_mapper_derive::PostgresMapper;

#[derive(Clone, Debug, Serialize, Deserialize, FromSql, ToSql)]
pub struct Coord {
    pub lon: f64,
    pub lat: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Area {
    min: Coord,
    max: Coord,
}

impl From<ewkb::Point> for Coord {
    fn from(p: ewkb::Point) -> Self {
        Self { lon: p.x, lat: p.y }
    }
}

impl From<geo::Coordinate<f64>> for Coord {
    fn from(c: geo::Coordinate<f64>) -> Self {
        Self { lon: c.x, lat: c.y }
    }
}

#[derive(Clone, Debug, Deserialize, PostgresMapper, Serialize)]
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

#[derive(Clone, Debug, Deserialize, PostgresMapper, Serialize)]
#[pg_mapper(table = "wind_points")]
pub struct WindPoint {
    pub id: i64,
    pub wind_report_id: i64,
    pub coord: Coord,
    pub u: f64,
    pub v: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Course {
    pub key: String,
    pub name: String,
    pub start_time: DateTime<Utc>,
    pub start_coord: Coord,
    pub finish_coord: Coord,
    pub time_factor: i8,
}

impl Course {
    pub fn real_time(&self, clock: i64) -> DateTime<Utc> {
        self.start_time + Duration::milliseconds(clock) * self.time_factor.into()
    }
}

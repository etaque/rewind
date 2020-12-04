use chrono::naive::NaiveDate;
use chrono::{DateTime, Utc};
use postgis::ewkb::Point;
use serde::{Deserialize, Serialize};
use tokio_pg_mapper_derive::PostgresMapper;
// use uuid::Uuid;

#[derive(Serialize, Deserialize)]
#[serde(remote = "Point")]
struct PointDef {
    pub x: f64,
    pub y: f64,
    pub srid: Option<i32>,
}

#[derive(Deserialize, PostgresMapper, Serialize)]
#[pg_mapper(table = "wind_records")]
pub struct WindRecord {
    pub id: i64,
    pub url: String,
    pub day: NaiveDate,
    pub hour: i16,
    pub forecast: i16,
    pub creation_time: DateTime<Utc>,
}

#[derive(Deserialize, PostgresMapper, Serialize)]
#[pg_mapper(table = "wind_points")]
pub struct WindPoint {
    pub id: i64,
    pub wind_record_id: i64,
    #[serde(with = "PointDef")]
    pub point: Point,
    pub u: f64,
    pub v: f64,
}

// pub struct Course {
//     pub id: Uuid,
//     pub start_time: DateTime<Utc>,
//     pub start_point: Point,
//     pub finish_point: Point,
//     pub time_factor: i16,
// }

// pub struct Run {
//     pub id: Uuid,
//     pub course_id: Uuid,
// }

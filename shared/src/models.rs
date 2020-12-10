use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LngLat(pub f64, pub f64);

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LngLatBounds {
    pub sw: LngLat,
    pub ne: LngLat,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WindPoint {
    pub position: LngLat,
    pub u: f64,
    pub v: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Course {
    pub key: String,
    pub name: String,
    pub start_time: DateTime<Utc>,
    pub start: LngLat,
    pub finish: LngLat,
    pub time_factor: i8,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PlayerState {
    pub clock: i64,
    pub position: LngLat,
    pub viewport: LngLatBounds,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WindState {
    pub time: DateTime<Utc>,
    pub points: Vec<WindPoint>,
}

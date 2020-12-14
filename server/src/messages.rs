use chrono::serde::ts_milliseconds;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LngLat {
    pub lng: f64,
    pub lat: f64,
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
    #[serde(with = "ts_milliseconds")]
    pub start_time: DateTime<Utc>,
    pub start: LngLat,
    pub finish: LngLat,
    pub time_factor: i8,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WindReport {
    #[serde(with = "ts_milliseconds")]
    pub time: DateTime<Utc>,
    pub wind: WindPoint,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "tag")]
pub enum ToServer {
    GetWind {
        #[serde(with = "ts_milliseconds")]
        time: DateTime<Utc>,
        position: LngLat,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "tag")]
pub enum FromServer {
    SendWind(WindReport),
}

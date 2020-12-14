use chrono::serde::ts_milliseconds;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::models::*;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "tag")]
pub enum ToServer {
    GetWind {
        #[serde(with = "ts_milliseconds")]
        time: DateTime<Utc>,
        position: LngLat,
    },
    StartCourse {
        key: String,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "tag")]
pub enum FromServer {
    SendWind(WindReport),
}

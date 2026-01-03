use chrono::serde::ts_milliseconds;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WindReport {
    pub id: Uuid,
    #[serde(with = "ts_milliseconds")]
    pub time: DateTime<Utc>,
    pub day: String,
    pub hour: u32,
}

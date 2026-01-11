use chrono::serde::ts_milliseconds;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindReport {
    pub id: Uuid,
    #[serde(with = "ts_milliseconds")]
    pub time: DateTime<Utc>,
    pub png_url: String,
}

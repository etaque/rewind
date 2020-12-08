use actix::prelude::*;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::models::{Area, Coord, WindPoint};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PlayerState {
    pub clock: i64,
    pub position: Coord,
    pub viewport: Area,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WindState {
    pub time: DateTime<Utc>,
    pub points: Vec<WindPoint>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Message)]
#[rtype(result = "anyhow::Result<WindUpdate>")]
pub struct RunUpdate(pub PlayerState);

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WindUpdate(pub WindState);

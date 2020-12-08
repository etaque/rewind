use actix::prelude::*;
use serde::{Deserialize, Serialize};

use crate::models::{Area, Coord, WindPoint, WindReport};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PlayerState {
    pub clock: i64,
    pub position: Coord,
    pub viewport: Area,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WindState {
    pub report: WindReport,
    pub points: Vec<WindPoint>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Message)]
#[rtype(result = "anyhow::Result<WindUpdate>")]
pub struct RunUpdate(pub PlayerState);

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WindUpdate(pub WindState);

use serde::{Deserialize, Serialize};

use super::models::*;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub enum ToServer {
    UpdateRun(PlayerState),
    SelectCourse(String),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub enum FromServer {
    RefreshWind(WindState),
    InitCourse(Course, WindState),
    Unexpected(ToServer),
}

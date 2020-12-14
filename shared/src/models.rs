use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LngLat {
    pub lng: f64,
    pub lat: f64,
}

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

impl Course {
    pub fn real_time(&self, clock: i64) -> DateTime<Utc> {
        self.start_time + chrono::Duration::milliseconds(clock) * self.time_factor.into()
    }
}

// #[derive(Clone, Debug, Deserialize, Serialize)]
// pub struct PlayerState {
//     pub time: DateTime<Utc>,
//     pub position: LngLat,
// }

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WindReport {
    pub time: DateTime<Utc>,
    pub wind: WindPoint,
}

impl WindReport {
    pub fn initial(course: &Course) -> Self {
        Self {
            time: course.start_time.clone(),
            wind: WindPoint {
                position: course.start.clone(),
                u: 0.0,
                v: 0.0,
            },
        }
    }
}

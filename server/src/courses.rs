use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LngLat {
    pub lng: f64,
    pub lat: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Gate {
    pub center: LngLat,
    pub orientation: f64, // degrees, 0 = north-south (vertical), 90 = east-west (horizontal)
    pub length_nm: f64,   // length in nautical miles
}

impl Gate {
    /// Create a vertical (north-south) gate
    pub fn vertical(lng: f64, lat: f64, length_nm: f64) -> Self {
        Gate {
            center: LngLat { lng, lat },
            orientation: 0.0,
            length_nm,
        }
    }

    /// Create a horizontal (east-west) gate
    pub fn horizontal(lng: f64, lat: f64, length_nm: f64) -> Self {
        Gate {
            center: LngLat { lng, lat },
            orientation: 90.0,
            length_nm,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExclusionZone {
    pub name: String,
    pub polygon: Vec<LngLat>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Course {
    pub key: String,
    pub name: String,
    pub description: String,
    pub polar: String,
    pub start_time: i64,
    pub start: LngLat,
    pub start_heading: f64,
    pub finish_line: Gate,
    pub gates: Vec<Gate>,
    pub exclusion_zones: Vec<ExclusionZone>,
    pub route_waypoints: Vec<Vec<LngLat>>, // waypoints for each leg (start→gate0, gate0→gate1, ..., gateN→finish)
    pub time_factor: u16,
    pub max_days: u8,
}

impl Course {
    pub fn max_finish_time(&self) -> i64 {
        self.start_time + (self.max_days as i64 * 24 * 60 * 60 * 1000)
    }

    pub fn race_time(&self, elapsed_since_start: i64) -> i64 {
        self.start_time + elapsed_since_start * (self.time_factor as i64)
    }
}

pub fn all() -> Vec<Course> {
    serde_json::from_str(include_str!("courses.json")).expect("Failed to parse courses.json")
}

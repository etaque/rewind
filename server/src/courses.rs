use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct LngLat {
    pub lng: f64,
    pub lat: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct Gate {
    pub point1: LngLat,
    pub point2: LngLat,
}

impl Gate {
    pub fn midpoint(&self) -> LngLat {
        LngLat {
            lng: (self.point1.lng + self.point2.lng) / 2.0,
            lat: (self.point1.lat + self.point2.lat) / 2.0,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Course {
    pub key: String,
    pub name: String,
    pub start_time: i64,
    pub start: LngLat,
    pub start_heading: f64,
    pub finish_line: Gate,
    pub gates: Vec<Gate>,
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
    vec![
        Course {
            key: "rdr22".to_string(),
            name: "Route du Rhum 2022".to_string(),
            // 2022-11-09T13:15:00Z in milliseconds
            start_time: 1668002100000,
            start: LngLat {
                lng: -1.9991,
                lat: 48.7870,
            },
            start_heading: 300.0,
            finish_line: Gate {
                point1: LngLat {
                    lng: -61.53,
                    lat: 16.03,
                },
                point2: LngLat {
                    lng: -61.53,
                    lat: 16.43,
                },
            },
            gates: vec![],
            time_factor: 5000,
            max_days: 21,
        },
        Course {
            key: "vg20".to_string(),
            name: "Vendee Globe 2020".to_string(),
            // 2020-11-08T11:00:00+01:00 in milliseconds
            start_time: 1604833200000,
            start: LngLat {
                lng: -1.788456535301071,
                lat: 46.470243284275966,
            },
            start_heading: 270.0,
            finish_line: Gate {
                point1: LngLat {
                    lng: -1.988456535301071,
                    lat: 46.470243284275966,
                },
                point2: LngLat {
                    lng: -1.588456535301071,
                    lat: 46.470243284275966,
                },
            },
            gates: vec![],
            time_factor: 10000,
            max_days: 90,
        },
        Course {
            key: "sh24".to_string(),
            name: "Sydney Hobart 2024".to_string(),
            // 2024-12-26T13:00:00+11:00 (1pm AEDT Boxing Day) in milliseconds
            start_time: 1735178400000,
            start: LngLat {
                lng: 151.45,
                lat: -33.86,
            },
            start_heading: 180.0,
            finish_line: Gate {
                point1: LngLat {
                    lng: 147.30,
                    lat: -43.10,
                },
                point2: LngLat {
                    lng: 147.70,
                    lat: -43.10,
                },
            },
            gates: vec![],
            time_factor: 2000,
            max_days: 5,
        },
    ]
}

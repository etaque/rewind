use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct LngLat {
    pub lng: f64,
    pub lat: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Course {
    pub key: String,
    pub name: String,
    pub start_time: i64,
    pub start: LngLat,
    pub start_heading: f64,
    pub finish: LngLat,
    pub time_factor: u32,
    pub max_days: u32,
}

pub fn all() -> Vec<Course> {
    vec![
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
            finish: LngLat {
                lng: -1.788456535301071,
                lat: 46.470243284275966,
            },
            time_factor: 2000,
            max_days: 90,
        },
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
            finish: LngLat {
                lng: -61.53,
                lat: 16.23,
            },
            time_factor: 2000,
            max_days: 21,
        },
    ]
}

use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct LngLat {
    pub lng: f64,
    pub lat: f64,
}

#[derive(Clone, Debug, Serialize)]
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

    /// Compute the two endpoints of the gate
    pub fn endpoints(&self) -> (LngLat, LngLat) {
        // 1 nautical mile = 1/60 degree of latitude
        let half_length_deg = (self.length_nm / 2.0) / 60.0;
        let orientation_rad = self.orientation.to_radians();

        // For orientation 0 (vertical): points are north/south of center
        // For orientation 90 (horizontal): points are east/west of center
        let lat_offset = half_length_deg * orientation_rad.cos();
        let lng_offset =
            half_length_deg * orientation_rad.sin() / self.center.lat.to_radians().cos();

        (
            LngLat {
                lng: self.center.lng - lng_offset,
                lat: self.center.lat - lat_offset,
            },
            LngLat {
                lng: self.center.lng + lng_offset,
                lat: self.center.lat + lat_offset,
            },
        )
    }

    pub fn midpoint(&self) -> LngLat {
        self.center.clone()
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct ExclusionZone {
    pub name: String,
    pub polygon: Vec<LngLat>,
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
    pub exclusion_zones: Vec<ExclusionZone>,
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
            finish_line: Gate::vertical(-61.53, 16.23, 24.0), // ~24 NM vertical gate
            gates: vec![],
            exclusion_zones: vec![],
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
            finish_line: Gate::horizontal(-1.788456535301071, 46.470243284275966, 24.0),
            gates: vec![
                Gate::vertical(20.0, -39.9, 612.0),   // Cape of Good Hope (land to AEZ)
                Gate::vertical(114.0, -43.6, 1104.0), // Cape Leeuwin (land to AEZ)
                Gate::vertical(-67.0, -57.2, 150.0),  // Cape Horn (land to AEZ)
            ],
            exclusion_zones: vec![vendee_globe_aez()],
            time_factor: 8000,
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
            finish_line: Gate::horizontal(147.50, -43.10, 24.0), // ~24 NM horizontal gate
            gates: vec![],
            exclusion_zones: vec![],
            time_factor: 2000,
            max_days: 5,
        },
    ]
}

/// Antarctic Exclusion Zone for Vendée Globe 2020
/// Approximate waypoints forming a polygon around Antarctica
/// Boats must stay NORTH of this zone
fn vendee_globe_aez() -> ExclusionZone {
    ExclusionZone {
        name: "Antarctic Exclusion Zone".to_string(),
        polygon: vec![
            // Starting from Atlantic, going east around Antarctica
            // Format: LngLat { lng, lat } - latitude is negative (southern hemisphere)
            LngLat { lng: -20.0, lat: -45.0 },
            LngLat { lng: -10.0, lat: -45.0 },
            LngLat { lng: 0.0, lat: -45.0 },
            LngLat { lng: 10.0, lat: -45.0 },
            LngLat { lng: 20.0, lat: -45.0 },
            LngLat { lng: 30.0, lat: -46.0 },
            LngLat { lng: 40.0, lat: -46.0 },
            LngLat { lng: 50.0, lat: -46.0 },
            LngLat { lng: 60.0, lat: -48.0 },
            LngLat { lng: 70.0, lat: -48.0 },
            LngLat { lng: 80.0, lat: -50.0 },
            LngLat { lng: 90.0, lat: -52.0 },
            LngLat { lng: 100.0, lat: -52.0 },
            LngLat { lng: 110.0, lat: -52.0 },
            LngLat { lng: 120.0, lat: -54.0 },
            LngLat { lng: 130.0, lat: -56.0 },
            LngLat { lng: 140.0, lat: -58.0 },
            LngLat { lng: 150.0, lat: -60.0 },
            LngLat { lng: 160.0, lat: -62.0 },
            LngLat { lng: 170.0, lat: -62.0 },
            LngLat { lng: 180.0, lat: -62.0 },
            LngLat { lng: -170.0, lat: -62.0 },
            LngLat { lng: -160.0, lat: -62.0 },
            LngLat { lng: -150.0, lat: -60.0 },
            LngLat { lng: -140.0, lat: -58.0 },
            LngLat { lng: -130.0, lat: -58.0 },
            LngLat { lng: -120.0, lat: -56.0 },
            LngLat { lng: -110.0, lat: -56.0 },
            LngLat { lng: -100.0, lat: -56.0 },
            LngLat { lng: -90.0, lat: -56.0 },
            LngLat { lng: -80.0, lat: -58.0 },
            LngLat { lng: -70.0, lat: -60.0 },  // Cape Horn approach
            LngLat { lng: -60.0, lat: -55.0 },  // Past Cape Horn
            LngLat { lng: -50.0, lat: -50.0 },
            LngLat { lng: -40.0, lat: -48.0 },
            LngLat { lng: -30.0, lat: -46.0 },
            LngLat { lng: -20.0, lat: -45.0 },  // Back to start
            // Now go to South Pole to close the polygon (everything south is excluded)
            LngLat { lng: -20.0, lat: -90.0 },
            LngLat { lng: 180.0, lat: -90.0 },
        ],
    }
}

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
    vec![
        Course {
            key: "mt23".to_string(),
            name: "Mini Transat 2023".to_string(),
            description: "Solo transatlantic race for 6.50m boats, from France to the Caribbean via the Canaries".to_string(),
            polar: "mini-650".to_string(),
            // 2023-09-25T13:38:00Z in milliseconds
            start_time: 1695649080000,
            start: LngLat {
                lng: -1.79,
                lat: 46.47,
            },
            start_heading: 240.0,
            finish_line: Gate::vertical(-61.27, 16.25, 12.0), // Saint-François, Guadeloupe
            gates: vec![
                Gate::vertical(-17.9, 28.7, 24.0), // La Palma, Canary Islands
            ],
            exclusion_zones: vec![],
            route_waypoints: vec![
                // Leg 0: Start → La Palma (down Bay of Biscay, along Portuguese/Moroccan coast)
                vec![
                    LngLat { lng: -5.0, lat: 44.0 },
                    LngLat { lng: -10.0, lat: 38.0 },
                    LngLat { lng: -14.0, lat: 32.0 },
                ],
                // Leg 1: La Palma → Saint-François (trade winds route across Atlantic)
                vec![
                    LngLat { lng: -25.0, lat: 24.0 },
                    LngLat { lng: -40.0, lat: 20.0 },
                    LngLat { lng: -55.0, lat: 17.0 },
                ],
            ],
            time_factor: 3000,
            max_days: 25,
        },
        Course {
            key: "rdr22".to_string(),
            name: "Route du Rhum 2022".to_string(),
            description: "Solo transatlantic race from Saint-Malo to Guadeloupe".to_string(),
            polar: "vr-imoca-full-pack".to_string(),
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
            route_waypoints: vec![vec![]], // Single leg with no intermediate waypoints
            time_factor: 5000,
            max_days: 21,
        },
        Course {
            key: "ore21".to_string(),
            name: "The Ocean Race Europe 2021".to_string(),
            description: "Offshore race from Lorient to Genoa via Cascais".to_string(),
            polar: "vr-imoca-full-pack".to_string(),
            // 2021-05-29T11:45:00Z (13:45 CEST) in milliseconds
            start_time: 1622285100000,
            start: LngLat {
                lng: -3.52,
                lat: 47.65,
            },
            start_heading: 200.0,
            finish_line: Gate::horizontal(8.85, 44.25, 12.0), // Genoa, Italy
            gates: vec![
                Gate::horizontal(-9.60, 38.55, 12.0), // Cascais, Portugal
            ],
            exclusion_zones: vec![],
            route_waypoints: vec![
                // Leg 0: Lorient → Cascais (Bay of Biscay, along Portuguese coast)
                vec![
                    LngLat { lng: -5.0, lat: 45.0 },
                    LngLat { lng: -9.5, lat: 42.0 },
                ],
                // Leg 1: Cascais → Genoa (through Strait of Gibraltar, Mediterranean)
                vec![
                    LngLat { lng: -6.0, lat: 36.5 },
                    LngLat { lng: -3.0, lat: 36.5 },
                    LngLat { lng: 3.0, lat: 39.0 },
                    LngLat { lng: 6.0, lat: 42.0 },
                ],
            ],
            time_factor: 2000,
            max_days: 22,
        },
        Course {
            key: "vg20".to_string(),
            name: "Vendee Globe 2020".to_string(),
            description: "Solo non-stop around the world race via the three great capes".to_string(),
            polar: "vr-imoca-full-pack".to_string(),
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
            route_waypoints: vec![
                // Leg 0: Start → Cape of Good Hope (down Atlantic, west of Africa)
                vec![
                    LngLat { lng: -12.0, lat: 35.0 },
                    LngLat { lng: -18.0, lat: 15.0 },
                    LngLat { lng: -10.0, lat: -5.0 },
                    LngLat { lng: 0.0, lat: -25.0 },
                ],
                // Leg 1: Cape of Good Hope → Cape Leeuwin (Indian Ocean, north of AEZ)
                vec![
                    LngLat { lng: 45.0, lat: -43.0 },
                    LngLat { lng: 75.0, lat: -45.0 },
                    LngLat { lng: 95.0, lat: -48.0 },
                ],
                // Leg 2: Cape Leeuwin → Cape Horn (Southern Ocean, north of AEZ)
                vec![
                    LngLat { lng: 145.0, lat: -54.0 },
                    LngLat { lng: 175.0, lat: -58.0 },
                    LngLat { lng: -155.0, lat: -57.0 },
                    LngLat { lng: -115.0, lat: -53.0 },
                    LngLat { lng: -85.0, lat: -53.0 },
                ],
                // Leg 3: Cape Horn → Finish (up Atlantic, west of South America/Africa)
                vec![
                    LngLat { lng: -55.0, lat: -42.0 },
                    LngLat { lng: -40.0, lat: -25.0 },
                    LngLat { lng: -32.0, lat: -5.0 },
                    LngLat { lng: -22.0, lat: 15.0 },
                    LngLat { lng: -15.0, lat: 35.0 },
                ],
            ],
            time_factor: 8000,
            max_days: 90,
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

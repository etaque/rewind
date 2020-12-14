use chrono::{DateTime, NaiveDate, Utc};

use super::models::*;

static LSD: LngLat = LngLat {
    lng: 46.470243284275966,
    lat: -1.788456535301071,
};

pub fn vg20() -> Course {
    Course {
        key: "vg20".to_string(),
        name: "Vendée Globe 2020".to_string(),
        start_time: DateTime::<Utc>::from_utc(
            NaiveDate::from_ymd(2020, 11, 8).and_hms(11, 0, 0),
            Utc,
        ),
        start: LSD.clone(),
        finish: LSD.clone(),
        time_factor: 100,
    }
}

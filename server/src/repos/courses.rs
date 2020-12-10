use chrono::{DateTime, NaiveDate, Utc};
use shared::*;

pub fn vg20() -> Course {
    let lsd = LngLat(46.470243284275966, -1.788456535301071);
    Course {
        key: "vg20".to_string(),
        name: "Vendée Globe 2020".to_string(),
        start_time: DateTime::<Utc>::from_utc(
            NaiveDate::from_ymd(2020, 11, 8).and_hms(11, 0, 0),
            Utc,
        ),
        start: lsd.clone(),
        finish: lsd.clone(),
        time_factor: 100,
    }
}

use chrono::naive::NaiveDate;

#[derive(Clone, Debug)]
pub struct Point {
    pub lon: f64,
    pub lat: f64,
}

#[derive(Clone, Debug)]
pub struct WindRecord {
    pub id: i64,
    pub url: String,
    pub day: NaiveDate,
    pub hour: i16,
}

#[derive(Clone, Debug)]
pub struct WindPoint {
    pub id: i64,
    pub wind_record_id: i64,
    pub point: Point,
    pub u: f64,
    pub v: f64,
}

use crate::cli::GribArgs;
use crate::db;
use crate::models::{WindReport, SRID};
use chrono::{DateTime, Utc};
use futures::pin_mut;
use postgis::ewkb;
use reqwest;
use std::collections::HashMap;
use std::io::{copy, Cursor};
use std::num::ParseFloatError;
use std::path::Path;
use std::process::Command;
use std::str::FromStr;
use tokio_pg_mapper::FromTokioPostgresRow;
use tokio_postgres::binary_copy::BinaryCopyInWriter;
use tokio_postgres::types::{Kind, Type};

pub async fn exec(db_url: &str, args: GribArgs) -> anyhow::Result<()> {
    let res = reqwest::get(&args.url).await?;
    let mut content = Cursor::new(res.bytes().await?);

    let mut tmp = tempfile::NamedTempFile::new()?;

    copy(&mut content, &mut tmp)?;

    let path = tmp.into_temp_path().keep()?;

    let u_output = parse_file(&path, args.forecast, "10u")?;
    let v_output = parse_file(&path, args.forecast, "10v")?;

    let pool = db::pool(db_url).await?;
    let client = pool.get().await?;

    const GRID_SIZE: usize = 65160;
    let mut u_grid: HashMap<Coords, Value> = HashMap::with_capacity(GRID_SIZE);
    let mut v_grid: HashMap<Coords, Value> = HashMap::with_capacity(GRID_SIZE);

    for entry in u_output.into_iter() {
        u_grid.insert(entry.coords, entry.value);
    }
    for entry in v_output.into_iter() {
        v_grid.insert(entry.coords, entry.value);
    }

    let target_time = DateTime::<Utc>::from_utc(
        args.day.and_hms((args.hour + args.forecast) as u32, 0, 0),
        Utc,
    );

    let row = client
        .query_one(
            "INSERT INTO wind_reports (url, day, hour, forecast, target_time) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            &[&args.url, &args.day, &args.hour, &args.forecast, &target_time],
        )
        .await?;

    let report = WindReport::from_row(row)?;

    let sink = client
        .copy_in("COPY wind_points (wind_report_id, point, speed, direction) FROM STDIN BINARY")
        .await?;

    // Geom has a dynamic OID hence the 0. Ignored by rust-postgis anyway:
    // https://github.com/andelf/rust-postgis/blob/9dff397feae9e1b22454cb269d6a9b1af7e6c530/src/postgis.rs#L22
    let geom_type = Type::new(
        String::from("geometry"),
        0,
        Kind::Pseudo,
        String::from("public"),
    );
    let writer =
        BinaryCopyInWriter::new(sink, &[Type::INT8, geom_type, Type::FLOAT8, Type::FLOAT8]);
    pin_mut!(writer);

    for lat in -85..85 {
        for lon in 0..360 {
            let k = (format!("{}.000", lat), format!("{}.000", lon));
            match u_grid.get(&k).zip(v_grid.get(&k)) {
                Some((u, v)) => {
                    let corrected_lon = if lon > 180 { lon - 360 } else { lon };
                    // http://colaweb.gmu.edu/dev/clim301/lectures/wind/wind-uv
                    let speed = (u.powi(2) + v.powi(2)).sqrt();
                    let direction = v.atan2(*u).to_degrees();
                    let point = &ewkb::Point::new(corrected_lon as f64, lat as f64, Some(SRID));
                    writer
                        .as_mut()
                        .write(&[&report.id, &point, &speed, &direction])
                        .await
                        .unwrap();
                }
                None => (),
            }
        }
    }
    writer.finish().await.unwrap();

    println!("{:#?}", report);
    Ok(())
}

type Coords = (String, String);

struct Entry {
    coords: Coords,
    value: Value,
}

type Value = f64;

impl FromStr for Entry {
    type Err = ParseFloatError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let items: Vec<&str> = s.split_ascii_whitespace().collect();
        let lat = items[0].to_string();
        let lon = items[1].to_string();
        let value = items[2].parse::<f64>()?;

        Ok(Entry {
            coords: (lat, lon),
            value,
        })
    }
}

fn parse_file(path: &Path, forecast: i16, short_name: &str) -> anyhow::Result<Vec<Entry>> {
    let output = Command::new("grib_get_data")
        .arg("-w")
        .arg(format!("stepRange={},shortName={}", forecast, short_name))
        .arg(&path)
        .output()?;
    let s = String::from_utf8(output.stdout)?;
    Ok(s.lines()
        .skip(1)
        .filter(|l| !l.contains(".500"))
        .filter_map(|s| s.parse::<Entry>().ok())
        .collect::<Vec<Entry>>())
}

use ::rewind::environment::Environment;
use chrono::NaiveDate;
use clap::{App, Arg, ArgMatches, SubCommand};
use futures::pin_mut;
use geo_types::Point;
use reqwest;
use std::collections::HashMap;
use std::io::{copy, Cursor};
use std::num::ParseFloatError;
use std::path::Path;
use std::process::Command;
use std::str::FromStr;
use tokio_postgres::binary_copy::BinaryCopyInWriter;
use tokio_postgres::types::Type;

pub fn cli() -> App<'static, 'static> {
    SubCommand::with_name("grib")
        .arg(
            Arg::with_name("url")
                .long("url")
                .required(true)
                .takes_value(true),
        )
        .arg(
            Arg::with_name("day")
                .long("day")
                .required(true)
                .takes_value(true),
        )
        .arg(
            Arg::with_name("hour")
                .long("hour")
                .required(true)
                .takes_value(true),
        )
}

pub async fn exec(args: &ArgMatches<'static>) -> anyhow::Result<()> {
    let url = args.value_of("url").unwrap();
    let res = reqwest::get(url).await?;
    let mut content = Cursor::new(res.bytes().await?);

    let mut tmp = tempfile::NamedTempFile::new()?;

    copy(&mut content, &mut tmp)?;

    let path = tmp.into_temp_path().keep()?;

    let u_output = parse_file(&path, "10u")?;
    let v_output = parse_file(&path, "10v")?;

    let day = NaiveDate::parse_from_str(args.value_of("day").unwrap(), "%Y-%m-%d")?;
    let hour = args.value_of("hour").unwrap().parse::<i16>()?;

    let env = Environment::new().await?;
    let conn = env.db_pool.get().await?;

    const GRID_SIZE: usize = 65160;
    let mut u_grid: HashMap<Coords, Value> = HashMap::with_capacity(GRID_SIZE);
    let mut v_grid: HashMap<Coords, Value> = HashMap::with_capacity(GRID_SIZE);

    for entry in u_output.into_iter() {
        u_grid.insert(entry.coords, entry.value);
    }
    for entry in v_output.into_iter() {
        v_grid.insert(entry.coords, entry.value);
    }

    let _record_id = conn
        .execute(
            "INSERT INTO wind_records (url, day, hour) VALUES ($1, $2, $3)",
            &[&url, &day, &hour],
        )
        .await?;

    let sink = conn
        .copy_in("COPY wind_points (wind_record_id, point, u, v) FROM STDIN BINARY")
        .await?;
    let writer =
        BinaryCopyInWriter::new(sink, &[Type::INT4, Type::POINT, Type::FLOAT8, Type::FLOAT8]);
    pin_mut!(writer);

    for lat in -90..90 {
        for lon in 0..360 {
            let k = (format!("{}.000", lat), format!("{}.000", lon));
            match u_grid.get(&k).zip(v_grid.get(&k)) {
                Some((u, v)) => {
                    let point = Point::new(lat as f64, lon as f64);
                    writer.as_mut().write(&[&1, &point, &u, &v]).await.unwrap();
                }
                None => (),
            }
        }
    }
    writer.finish().await.unwrap();

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

fn parse_file(path: &Path, short_name: &str) -> anyhow::Result<Vec<Entry>> {
    let output = Command::new("grib_get_data")
        .arg("-w")
        .arg(format!("stepRange=3,shortName={}", short_name))
        .arg(&path)
        .output()?;
    let s = String::from_utf8(output.stdout)?;
    Ok(s.lines()
        .skip(1)
        .filter(|l| !l.contains(".500"))
        .filter_map(|s| s.parse::<Entry>().ok())
        .collect::<Vec<Entry>>())
}

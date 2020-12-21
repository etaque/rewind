use crate::db;
use crate::models::SRID;
use postgis::ewkb::Point;
use std::fs::File;
use std::io::prelude::*;
use std::path::Path;
use uuid::Uuid;

pub const U_BAND: i32 = 1;
pub const V_BAND: i32 = 2;

pub async fn create<'a>(client: &db::Client<'a>, id: &Uuid, path: &Path) -> anyhow::Result<()> {
    let mut f = File::open(path)?;
    let mut buffer = Vec::new();
    f.read_to_end(&mut buffer)?;
    let stmt = "INSERT INTO wind_rasters(id, rast) SELECT $1, ST_FromGDALRaster(($2)::bytea, $3)";
    client.execute(stmt, &[&id, &buffer, &SRID]).await?;
    Ok(())
}

pub async fn wind_at_point<'a>(
    client: &db::Client<'a>,
    id: &Uuid,
    point: &Point,
) -> anyhow::Result<(f64, f64)> {
    let stmt = "SELECT ST_Value(rast, $3, shifted.pt) AS u, \
                ST_Value(rast, $4, shifted.pt) AS v \
                FROM wind_rasters, (SELECT ST_ShiftLongitude($1) as pt) as shifted \
                WHERE id=$2";
    let row = client
        .query_one(stmt, &[&point, &id, &U_BAND, &V_BAND])
        .await?;
    let u = row.try_get("u")?;
    let v = row.try_get("v")?;
    Ok((u, v))
}

pub async fn as_png<'a>(
    client: &db::Client<'a>,
    id: &Uuid,
    band_id: i32,
) -> anyhow::Result<Vec<u8>> {
    let stmt = "SELECT ST_AsPNG(\
                    ST_Reclass(rast, $2::int, '-30-30:0-255', '8BUI'), $2) \
                    FROM wind_rasters WHERE id=$1";
    let row = client.query_one(stmt, &[&id, &band_id]).await?;
    let png = row.try_get(0)?;
    Ok(png)
}

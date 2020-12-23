use postgis::ewkb::Point;
use postgres_array::Array;
use std::fs::File;
use std::io::prelude::*;
use std::path::Path;
use uuid::Uuid;

use crate::db;
use crate::models::{RasterRenderingMode, SRID};

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

const UV_STMT: &str = r#"
    SELECT ST_AsPNG(ST_Reclass(rast, $2::int, '-30-30:0-255', '8BUI'), $2, 90)
    FROM wind_rasters
    WHERE id=$1"#;

const SPEED_STMT: &str = r#"
    SELECT ST_AsPNG(ST_Reclass(MapWindSpeed(rast), '0-30:0-255', '8BUI'), 1)
    FROM wind_rasters 
    WHERE id=$1"#;

pub async fn raster<'a>(
    client: &db::Client<'a>,
    id: &Uuid,
    mode: RasterRenderingMode,
) -> anyhow::Result<Vec<u8>> {
    let row = match mode {
        RasterRenderingMode::U => client.query_one(UV_STMT, &[&id, &U_BAND]).await?,
        RasterRenderingMode::V => client.query_one(UV_STMT, &[&id, &V_BAND]).await?,
        RasterRenderingMode::Speed => client.query_one(SPEED_STMT, &[&id]).await?,
    };

    let png = row.try_get(0)?;
    Ok(png)
}

pub async fn speed_values<'a>(client: &db::Client<'a>, id: &Uuid) -> anyhow::Result<Array<f64>> {
    let stmt = "SELECT ST_DumpValues(MapWindSpeed(rast), 1) FROM wind_rasters WHERE id=$1";
    let row = client.query_one(stmt, &[&id]).await?;
    let values = row.try_get(0)?;
    Ok(values)
}

pub async fn points_geojson<'a>(
    client: &db::Client<'a>,
    id: &Uuid,
) -> anyhow::Result<serde_json::Value> {
    let stmt = r#"
        SELECT json_build_object('type', 'FeatureCollection', 'features', json_agg(ST_AsGeoJSON(points.*)::json)) 
        FROM (SELECT (ST_PixelAsPoints(ST_Rescale(MapWindSpeed(rast), 1))).* FROM wind_rasters WHERE id=$1) AS points
    "#;
    let row = client.query_one(stmt, &[&id]).await?;
    let geojson = row.try_get(0)?;
    Ok(geojson)
}

// See https://github.com/postgis/postgis/blob/master/raster/doc/RFC2-WellKnownBinaryFormat
pub async fn points_blob<'a>(client: &db::Client<'a>, id: &Uuid) -> anyhow::Result<Vec<u8>> {
    let stmt = r#"
        SELECT ST_AsBinary(rast) FROM wind_rasters WHERE id=$1
    "#;
    let row = client.query_one(stmt, &[&id]).await?;
    let geojson = row.try_get(0)?;
    Ok(geojson)
}

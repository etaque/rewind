use uuid::Uuid;

use crate::db;
use crate::models::{RasterRenderingMode, SRID};

pub const U_BAND: i32 = 1;
pub const V_BAND: i32 = 2;

pub async fn create<'a>(client: &db::Client<'a>, id: &Uuid, buffer: Vec<u8>) -> anyhow::Result<()> {
    let stmt = "INSERT INTO wind_rasters(id, rast) SELECT $1, ST_FromGDALRaster(($2)::bytea, $3)";
    client.execute(stmt, &[&id, &buffer, &SRID]).await?;
    Ok(())
}

const BAND_STMT: &str = r#"
    SELECT ST_AsPNG(ST_Reclass(rast, $2::int, '-30-30:0-255', '8BUI'), $2)
    FROM wind_rasters
    WHERE id=$1"#;

const UV_STMT: &str = r#"
    SELECT ST_AsPNG(
        ST_Reclass(
            ST_Reclass(
                ST_AddBand(rast, '8BUI'::text, 0::int),
                1, '-30-30:0-255', '8BUI'),
            2, '-30-30:0-255', '8BUI'))
    FROM wind_rasters
    WHERE id=$1"#;

const SPEED_STMT: &str = r#"
    SELECT ST_AsPNG(
        ST_ColorMap(
            ST_Reclass(
                MapWindSpeed(
                    ST_Resize(
                        ST_Transform( rast, 32663, 'Bilinear'),
                        1024, 512, 'Bilinear')),
                '0-30:0-255', '8BUI'),
        1, 'bluered'))
    FROM wind_rasters
    WHERE id=$1"#;

pub async fn as_png<'a>(
    client: &db::Client<'a>,
    id: &Uuid,
    mode: RasterRenderingMode,
) -> anyhow::Result<Vec<u8>> {
    let row = match mode {
        RasterRenderingMode::U => client.query_one(BAND_STMT, &[&id, &U_BAND]).await?,
        RasterRenderingMode::V => client.query_one(BAND_STMT, &[&id, &V_BAND]).await?,
        RasterRenderingMode::UV => client.query_one(UV_STMT, &[&id]).await?,
        RasterRenderingMode::Speed => client.query_one(SPEED_STMT, &[&id]).await?,
    };

    let png = row.try_get(0)?;
    Ok(png)
}

// See https://github.com/postgis/postgis/blob/master/raster/doc/RFC2-WellKnownBinaryFormat
pub async fn as_wkb<'a>(client: &db::Client<'a>, id: &Uuid) -> anyhow::Result<Vec<u8>> {
    let stmt = "SELECT ST_AsBinary(rast) FROM wind_rasters WHERE id=$1";
    let row = client.query_one(stmt, &[&id]).await?;
    let geojson = row.try_get(0)?;
    Ok(geojson)
}

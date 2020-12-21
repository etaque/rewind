use chrono::{DateTime, Utc};

use crate::db;
use crate::models::WindReport;
use tokio_pg_mapper::FromTokioPostgresRow;
use uuid::Uuid;

// TODO derive that
pub async fn create<'a>(client: &db::Client<'a>, report: &WindReport) -> anyhow::Result<()> {
    client
        .execute(
            "INSERT INTO wind_reports (id, raster_id, url, day, hour, forecast, target_time, creation_time)\
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            &[&report.id, &report.raster_id, &report.url, &report.day, &report.hour, &report.forecast, &report.target_time, &report.creation_time],
        )
        .await?;
    Ok(())
}

pub async fn get<'a>(client: &db::Client<'a>, id: Uuid) -> anyhow::Result<WindReport> {
    let stmt = "SELECT * FROM wind_reports WHERE id = $1";
    let row = client.query_one(stmt, &[&id]).await?;
    let wr = WindReport::from_row(row)?;
    Ok(wr)
}

pub async fn find_closest<'a>(
    client: &db::Client<'a>,
    time: &DateTime<Utc>,
) -> anyhow::Result<WindReport> {
    let stmt = "SELECT * FROM wind_reports \
                ORDER BY abs(extract(epoch from ($1 - target_time))) asc LIMIT 1";
    let row = client.query_one(stmt, &[&time]).await?;
    let wr = WindReport::from_row(row)?;
    Ok(wr)
}

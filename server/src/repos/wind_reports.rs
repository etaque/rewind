use chrono::{DateTime, Utc};

use crate::db;
use crate::models::WindReport;
use tokio_pg_mapper::FromTokioPostgresRow;

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

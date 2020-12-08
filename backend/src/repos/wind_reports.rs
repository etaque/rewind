use chrono::{DateTime, Utc};

use crate::db;
use crate::models::WindReport;
use tokio_pg_mapper::FromTokioPostgresRow;

pub async fn find_closest<'a>(
    conn: db::Conn<'a>,
    time: DateTime<Utc>,
) -> anyhow::Result<WindReport> {
    let day = time.date().naive_local();
    // TODO use hour and forecast
    let stmt = "SELECT * FROM wind_reports ORDER BY abs($1 - day) asc LIMIT 1";
    let row = conn.query_one(stmt, &[&day]).await?;
    let wr = WindReport::from_row(row)?;
    Ok(wr)
}

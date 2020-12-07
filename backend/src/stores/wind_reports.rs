use chrono::{DateTime, Utc};

use crate::db;
use crate::models::WindReport;
use tokio_pg_mapper::FromTokioPostgresRow;
use tokio_postgres::Error;

pub async fn find_closest<'a>(
    conn: db::Conn<'a>,
    time: DateTime<Utc>,
) -> Result<Option<WindReport>, Error> {
    let stmt = "SELECT * FROM wind_reports WHERE day < $1 ORDER BY hour asc";
    match conn.query_opt(stmt, &[&time]).await? {
        Some(row) => Ok(Some(WindReport::from_row(row).unwrap())),
        None => Ok(None),
    }
}

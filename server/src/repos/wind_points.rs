use crate::db;
use crate::models::{Point, WindPoint};
use tokio_pg_mapper::FromTokioPostgresRow;

pub async fn by_report_id<'a>(
    conn: &db::Conn<'a>,
    report_id: i64,
) -> anyhow::Result<Vec<WindPoint>> {
    let stmt = "SELECT * FROM wind_points \
                WHERE wind_report_id = $1";
    let rows = conn.query(stmt, &[&report_id]).await?;
    let points = super::from_rows(rows)?;
    Ok(points)
}

// TODO
pub async fn closest<'a>(
    conn: &db::Conn<'a>,
    report_id: i64,
    _at: &Point,
) -> anyhow::Result<WindPoint> {
    let stmt = "SELECT * FROM wind_points \
                WHERE wind_report_id = $1 LIMIT 1";
    let row = conn.query_one(stmt, &[&report_id]).await?;
    let point = WindPoint::from_row(row)?;
    Ok(point)
}

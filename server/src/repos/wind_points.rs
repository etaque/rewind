use crate::db;
use crate::models::WindPoint;
use tokio_pg_mapper::FromTokioPostgresRow;

// pub async fn by_report_id<'a>(
//     client: &db::Client<'a>,
//     report_id: i64,
// ) -> anyhow::Result<Vec<WindPoint>> {
//     let stmt = "SELECT * FROM wind_points \
//                 WHERE wind_report_id = $1";
//     let rows = client.query(stmt, &[&report_id]).await?;
//     let points = super::from_rows(rows)?;
//     Ok(points)
// }

// TODO
pub async fn at<'a>(
    client: &db::Client<'a>,
    report_id: i64,
    _at: &postgis::ewkb::Point,
) -> anyhow::Result<Option<WindPoint>> {
    let stmt = "SELECT * FROM wind_points \
                WHERE wind_report_id = $1 LIMIT 1";
    let row_opt = client.query_opt(stmt, &[&report_id]).await?;
    match row_opt {
        Some(row) => {
            let point = WindPoint::from_row(row)?;
            Ok(Some(point))
        }
        None => Ok(None),
    }
}

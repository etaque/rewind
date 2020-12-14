use crate::db;
use crate::models::WindPoint;
use tokio_pg_mapper::FromTokioPostgresRow;

pub async fn at<'a>(
    client: &db::Client<'a>,
    report_id: i64,
    point: &postgis::ewkb::Point,
) -> anyhow::Result<Option<WindPoint>> {
    let stmt = "SELECT * FROM wind_points \
                WHERE wind_report_id = $1 \
                AND $2 && st_expand(point, 10) \
                ORDER BY $3 <-> point \
                LIMIT 1";
    let row_opt = client
        .query_opt(stmt, &[&report_id, &point, &point])
        .await?;
    match row_opt {
        Some(row) => {
            let wp = WindPoint::from_row(row)?;
            Ok(Some(wp))
        }
        None => Ok(None),
    }
}

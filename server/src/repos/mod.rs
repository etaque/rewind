pub mod wind_rasters;
pub mod wind_reports;

use tokio_pg_mapper::FromTokioPostgresRow;

fn from_rows<A: FromTokioPostgresRow>(
    rows: Vec<tokio_postgres::row::Row>,
) -> ::std::result::Result<Vec<A>, tokio_pg_mapper::Error> {
    rows.iter()
        .map(|row| A::from_row_ref(&row).map_err(|e| e.into()))
        .collect()
}

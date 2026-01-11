pub mod wind_reports;

use tokio_postgres::Row;

pub fn from_rows<A>(rows: Vec<Row>) -> Result<Vec<A>, tokio_postgres::Error>
where
    A: for<'a> TryFrom<&'a Row, Error = tokio_postgres::Error>,
{
    rows.iter().map(|row| A::try_from(row)).collect()
}

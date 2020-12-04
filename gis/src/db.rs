use crate::conf::Conf;
use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;

pub async fn pool(
    conf: Conf,
) -> Result<Pool<PostgresConnectionManager<tokio_postgres::NoTls>>, tokio_postgres::Error> {
    let mgr =
        PostgresConnectionManager::new(conf.database_url.parse().unwrap(), tokio_postgres::NoTls);

    Pool::builder().build(mgr).await
}

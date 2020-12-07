use crate::conf::Conf;
use bb8;
use bb8_postgres::PostgresConnectionManager;
use tokio_postgres::NoTls;

pub type Pool = bb8::Pool<PostgresConnectionManager<NoTls>>;
pub type Conn<'a> = bb8::PooledConnection<'a, PostgresConnectionManager<NoTls>>;

pub async fn pool(conf: Conf) -> Result<Pool, tokio_postgres::Error> {
    let mgr =
        PostgresConnectionManager::new(conf.database_url.parse().unwrap(), tokio_postgres::NoTls);

    bb8::Pool::builder().build(mgr).await
}

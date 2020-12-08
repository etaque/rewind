use actix_web::web;
use bb8;
use bb8_postgres::PostgresConnectionManager;
use tokio_postgres::NoTls;

pub type Pool = bb8::Pool<PostgresConnectionManager<NoTls>>;
pub type Conn<'a> = bb8::PooledConnection<'a, PostgresConnectionManager<NoTls>>;

pub async fn pool(url: String) -> Result<Pool, tokio_postgres::Error> {
    let mgr = PostgresConnectionManager::new(url.parse().unwrap(), tokio_postgres::NoTls);

    bb8::Pool::builder().build(mgr).await
}

pub async fn health(pool: web::Data<Pool>) -> anyhow::Result<String> {
    let conn = pool.get().await?;
    let row = conn.query_one("SELECT $1::TEXT", &[&"42"]).await?;
    let res: String = row.try_get(0)?;
    Ok(res)
}

mod embedded {
    use refinery::embed_migrations;
    embed_migrations!("migrations");
}

pub async fn migrate(url: String) -> anyhow::Result<()> {
    let mut conn = pool(url).await?.dedicated_connection().await?;

    println!("Running migrations");
    embedded::migrations::runner().run_async(&mut conn).await?;
    Ok(())
}

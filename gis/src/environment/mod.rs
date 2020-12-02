use bb8::Pool;
use bb8_postgres::PostgresConnectionManager;
use dotenv::dotenv;
use std::env;

pub struct Environment {
    pub db_url: String,
    pub db_pool: Pool<PostgresConnectionManager<tokio_postgres::NoTls>>,
}

impl Environment {
    pub async fn new() -> anyhow::Result<Self> {
        dotenv().ok();
        let db_url = &env::var("DATABASE_URL")?;
        let pg_mgr = PostgresConnectionManager::new(db_url.parse().unwrap(), tokio_postgres::NoTls);

        let db_pool = match Pool::builder().build(pg_mgr).await {
            Ok(pool) => pool,
            Err(e) => panic!("builder error: {:?}", e),
        };

        Ok(Self {
            db_url: db_url.to_string(),
            db_pool,
        })
    }
}

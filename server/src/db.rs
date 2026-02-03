use anyhow::Result;
use once_cell::sync::OnceCell;
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};

use crate::config::config;

static POOL: OnceCell<SqlitePool> = OnceCell::new();

pub async fn init() -> Result<()> {
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&config().database_url)
        .await?;

    // Run migrations
    sqlx::migrate!("./migrations").run(&pool).await?;

    POOL.set(pool)
        .map_err(|_| anyhow::anyhow!("Pool already initialized"))?;

    // Seed courses if empty
    crate::courses::seed_if_empty().await?;

    Ok(())
}

pub fn pool() -> &'static SqlitePool {
    POOL.get().expect("Database not initialized - call db::init() first")
}

#[cfg(test)]
static TEST_INIT_DONE: OnceCell<()> = OnceCell::new();

#[cfg(test)]
pub async fn init_test() -> Result<()> {
    use tokio::sync::Mutex;
    use std::sync::OnceLock;

    static TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    let lock = TEST_LOCK.get_or_init(|| Mutex::new(()));

    // Fast path: if already fully initialized, return immediately
    if TEST_INIT_DONE.get().is_some() {
        return Ok(());
    }

    // Acquire async lock to serialize initialization
    let _guard = lock.lock().await;

    // Double-check after acquiring lock
    if TEST_INIT_DONE.get().is_some() {
        return Ok(());
    }

    // Initialize if pool not set
    if POOL.get().is_none() {
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect("sqlite::memory:")
            .await?;

        // Run migrations
        sqlx::migrate!("./migrations").run(&pool).await?;

        // Try to set the pool
        let _ = POOL.set(pool);
    }

    // Seed courses if empty
    crate::courses::seed_if_empty().await?;

    // Mark as fully initialized
    let _ = TEST_INIT_DONE.set(());

    Ok(())
}

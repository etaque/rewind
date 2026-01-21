use crate::config::config;
use anyhow::Result;
use rusqlite::Connection;
use std::sync::Mutex;

use once_cell::sync::Lazy;

static DB: Lazy<Mutex<Connection>> = Lazy::new(|| {
    let path = &config().db_path;
    log::info!("Opening database at {}", path);
    let conn = Connection::open(path).expect("Failed to open database");

    // Initialize schema immediately
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS wind_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            time INTEGER NOT NULL UNIQUE,
            grib_path TEXT NOT NULL,
            png_path TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'ncar',
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        );

        CREATE INDEX IF NOT EXISTS idx_wind_reports_time ON wind_reports(time);
        ",
    )
    .expect("Failed to initialize database schema");

    Mutex::new(conn)
});

/// Initialize the database schema (called on startup, but schema is also auto-created)
pub fn init_db() -> Result<()> {
    // Just access DB to trigger lazy initialization
    let _conn = DB.lock().unwrap();
    log::info!("Database initialized");
    Ok(())
}

/// Get a connection to the database
pub fn with_connection<F, T>(f: F) -> Result<T>
where
    F: FnOnce(&Connection) -> Result<T>,
{
    let conn = DB.lock().unwrap();
    f(&conn)
}

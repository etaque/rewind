use crate::config::config;
use crate::{courses, players, race_results};
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

    // Initialize race_results table
    race_results::init_table(&conn).expect("Failed to initialize race_results table");

    // Initialize players tables
    players::init_tables(&conn).expect("Failed to initialize players tables");

    // Initialize courses table and seed with defaults
    courses::init_table(&conn).expect("Failed to initialize courses table");
    courses::seed_if_empty(&conn).expect("Failed to seed courses");

    Mutex::new(conn)
});

/// Get a connection to the database
pub fn with_connection<F, T>(f: F) -> Result<T>
where
    F: FnOnce(&Connection) -> Result<T>,
{
    let conn = DB.lock().unwrap();
    f(&conn)
}

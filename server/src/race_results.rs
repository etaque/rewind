use anyhow::Result;
use rusqlite::{Connection, params};
use serde::Serialize;

/// A point in the recorded path
#[derive(Debug, Clone, Copy)]
pub struct PathPoint {
    pub race_time: i64, // Race time in ms
    pub lng: f32,
    pub lat: f32,
    pub heading: f32,
}

/// Leaderboard entry for hall of fame display
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HallOfFameEntry {
    pub id: i64, // For fetching replay
    pub rank: u32,
    pub player_name: String,
    pub email: Option<String>, // Verified player's email (masked by client)
    pub finish_time: i64,
    pub race_date: i64, // Unix timestamp ms
}

/// Initialize the race_results table
pub fn init_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS race_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_key TEXT NOT NULL,
            player_name TEXT NOT NULL,
            finish_time INTEGER NOT NULL,
            race_start_time INTEGER NOT NULL,
            path_s3_key TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),

            UNIQUE(course_key, player_name, race_start_time)
        );

        CREATE INDEX IF NOT EXISTS idx_leaderboard ON race_results(course_key, finish_time);
        ",
    )?;

    // Migration: add player_id column if missing (legacy)
    let has_player_id: bool = conn
        .prepare("PRAGMA table_info(race_results)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .any(|name| name.map_or(false, |n| n == "player_id"));

    if !has_player_id {
        conn.execute_batch("ALTER TABLE race_results ADD COLUMN player_id TEXT")?;
    }

    // Migration: add email column if missing
    let has_email: bool = conn
        .prepare("PRAGMA table_info(race_results)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .any(|name| name.map_or(false, |n| n == "email"));

    if !has_email {
        conn.execute_batch("ALTER TABLE race_results ADD COLUMN email TEXT")?;
    }

    Ok(())
}

/// Save a race result to the database
/// Only saves if email is provided (verified player)
pub fn save_result(
    conn: &Connection,
    course_key: &str,
    player_name: &str,
    email: Option<&str>,
    finish_time: i64,
    race_start_time: i64,
    path_s3_key: &str,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO race_results (course_key, player_name, email, finish_time, race_start_time, path_s3_key)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![course_key, player_name, email, finish_time, race_start_time, path_s3_key],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Get the hall of fame leaderboard for a course
/// Only returns results from verified players (those with email set)
pub fn get_leaderboard(
    conn: &Connection,
    course_key: &str,
    limit: u32,
) -> Result<Vec<HallOfFameEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, player_name, email, finish_time, race_start_time
         FROM race_results
         WHERE course_key = ?1 AND email IS NOT NULL
         ORDER BY finish_time ASC
         LIMIT ?2",
    )?;

    let entries = stmt
        .query_map(params![course_key, limit], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(entries
        .into_iter()
        .enumerate()
        .map(
            |(i, (id, player_name, email, finish_time, race_start_time))| HallOfFameEntry {
                id,
                rank: (i + 1) as u32,
                player_name,
                email,
                finish_time: finish_time - race_start_time, // Convert to elapsed duration
                race_date: race_start_time,
            },
        )
        .collect())
}

/// Get the S3 path key for a race result
pub fn get_path_key(conn: &Connection, result_id: i64) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT path_s3_key FROM race_results WHERE id = ?1")?;
    let key = stmt.query_row(params![result_id], |row| row.get(0)).ok();
    Ok(key)
}

// ============================================================================
// Binary path encoding/decoding
// ============================================================================

const PATH_VERSION: u32 = 1;

/// Encode path points to binary format for S3 storage
pub fn encode_path(points: &[PathPoint]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(8 + points.len() * 20);

    // Header
    buf.extend_from_slice(&PATH_VERSION.to_le_bytes());
    buf.extend_from_slice(&(points.len() as u32).to_le_bytes());

    // Points
    for point in points {
        buf.extend_from_slice(&point.race_time.to_le_bytes());
        buf.extend_from_slice(&point.lng.to_le_bytes());
        buf.extend_from_slice(&point.lat.to_le_bytes());
        buf.extend_from_slice(&point.heading.to_le_bytes());
    }

    buf
}

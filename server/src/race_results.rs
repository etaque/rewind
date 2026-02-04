use anyhow::Result;
use serde::Serialize;

use crate::db;

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
    pub player_id: Option<String>,
    pub finish_time: i64,
    pub race_date: i64, // Unix timestamp ms
}

/// Save a race result to the database
pub async fn save_result(
    course_key: &str,
    player_name: &str,
    player_id: &str,
    finish_time: i64,
    race_start_time: i64,
    path_s3_key: &str,
) -> Result<i64> {
    let result = sqlx::query(
        "INSERT INTO race_results (course_key, player_name, player_id, finish_time, race_start_time, path_s3_key)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(course_key)
    .bind(player_name)
    .bind(player_id)
    .bind(finish_time)
    .bind(race_start_time)
    .bind(path_s3_key)
    .execute(db::pool())
    .await?;
    Ok(result.last_insert_rowid())
}

/// Get the hall of fame leaderboard for a course
pub async fn get_leaderboard(course_key: &str, limit: u32) -> Result<Vec<HallOfFameEntry>> {
    let rows: Vec<(i64, String, Option<String>, i64, i64)> = sqlx::query_as(
        "SELECT id, player_name, player_id, finish_time, race_start_time
         FROM race_results
         WHERE course_key = ?
         ORDER BY finish_time ASC
         LIMIT ?",
    )
    .bind(course_key)
    .bind(limit)
    .fetch_all(db::pool())
    .await?;

    let entries = rows
        .into_iter()
        .enumerate()
        .map(
            |(i, (id, player_name, player_id, finish_time, race_start_time))| HallOfFameEntry {
                id,
                rank: (i + 1) as u32,
                player_name,
                player_id,
                finish_time, // Already stored as duration
                race_date: race_start_time,
            },
        )
        .collect();

    Ok(entries)
}

/// Get the S3 path key for a race result
pub async fn get_path_key(result_id: i64) -> Result<Option<String>> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT path_s3_key FROM race_results WHERE id = ?")
            .bind(result_id)
            .fetch_optional(db::pool())
            .await?;
    Ok(row.map(|(key,)| key))
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

use anyhow::anyhow;
use axum::extract::ws::{Message, WebSocket};
use bytes::Bytes;
use chrono::{DateTime, Utc};
use futures::{SinkExt, StreamExt};
use object_store::ObjectStoreExt;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{RwLock, mpsc};

use crate::{
    courses::Course,
    db,
    race_results::{self, PathPoint},
    s3,
    wind_reports::{self, WindReport},
};

// ============================================================================
// Message Types
// ============================================================================

/// Messages sent from client to server
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
pub enum ClientMessage {
    CreateRace {
        course_key: String,
        player_name: String,
    },
    JoinRace {
        race_id: String,
        player_name: String,
    },
    LeaveRace,
    StartRace,
    PositionUpdate {
        lng: f32,
        lat: f32,
        heading: f32,
    },
    GateCrossed {
        gate_index: usize,
        course_time: i64,
    },
}

/// Messages sent from server to client
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
pub enum ServerMessage {
    Error {
        message: String,
    },
    RaceCreated {
        race_id: String,
        player_id: String,
        wind_raster_sources: Vec<WindRasterSource>,
    },
    RaceJoined {
        race_id: String,
        player_id: String,
        course_key: String,
        wind_raster_sources: Vec<WindRasterSource>,
        players: Vec<PlayerInfo>,
        is_creator: bool,
    },
    PlayerJoined {
        player_id: String,
        player_name: String,
    },
    PlayerLeft {
        player_id: String,
    },
    RaceCountdown {
        seconds: i32,
    },
    PositionUpdate {
        player_id: String,
        lng: f32,
        lat: f32,
        heading: f32,
    },
    SyncRaceTime {
        race_time: i64,
    },
    RaceEnded {
        reason: String,
    },
    Leaderboard {
        entries: Vec<LeaderboardEntry>,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindRasterSource {
    #[serde(with = "chrono::serde::ts_milliseconds")]
    time: DateTime<Utc>,
    png_url: String,
}

impl From<&WindReport> for WindRasterSource {
    fn from(report: &WindReport) -> Self {
        WindRasterSource {
            time: report.time,
            png_url: report.png_url(),
        }
    }
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardEntry {
    pub player_id: String,
    pub player_name: String,
    pub next_gate_index: usize,
    pub distance_to_next_gate: f64,
    pub finish_time: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerInfo {
    pub id: String,
    pub name: String,
}

// ============================================================================
// State Types
// ============================================================================

#[derive(Debug, Clone)]
pub struct Player {
    pub id: String,
    pub name: String,
    pub tx: mpsc::UnboundedSender<ServerMessage>,
    pub position: Option<(f64, f64)>, // (lng, lat)
    pub heading: f32,
    pub next_gate_index: usize,       // 0..gates.len() for gates, gates.len() for finish
    pub finish_time: Option<i64>,     // None = racing, Some(time) = finished
    pub path_history: Vec<PathPoint>, // Accumulated path for replay
    pub last_sample_instant: Option<Instant>, // For 100ms real-time sampling
}

impl Player {
    pub fn info(&self) -> PlayerInfo {
        PlayerInfo {
            id: self.id.clone(),
            name: self.name.clone(),
        }
    }
}

#[derive(Debug)]
pub struct Race {
    pub course: Course,
    pub wind_raster_sources: Vec<WindRasterSource>,
    pub creator_id: String,
    pub players: HashMap<String, Player>,
    pub max_players: usize,
    pub race_start_time: Option<i64>,
    pub race_ended: bool,
    pub last_activity: DateTime<Utc>,
}

impl Race {
    fn new(course: Course, wind_raster_sources: Vec<WindRasterSource>, creator_id: String) -> Self {
        Race {
            course,
            wind_raster_sources,
            creator_id,
            players: HashMap::new(),
            max_players: 10,
            race_start_time: None,
            race_ended: false,
            last_activity: Utc::now(),
        }
    }

    pub fn race_started(&self) -> bool {
        self.race_start_time.is_some()
    }

    fn add_player(&mut self, player: Player) -> anyhow::Result<()> {
        if self.race_started() {
            return Err(anyhow!("Race has already started"));
        }
        if self.players.len() >= self.max_players {
            return Err(anyhow!("Race is full"));
        }
        self.players.insert(player.id.clone(), player);
        self.last_activity = Utc::now();
        Ok(())
    }

    fn remove_player(&mut self, player_id: &str) -> Option<Player> {
        self.last_activity = Utc::now();
        self.players.remove(player_id)
    }

    fn broadcast(&self, message: ServerMessage, exclude: Option<&str>) {
        for (id, player) in &self.players {
            if exclude.map_or(true, |ex| ex != id) {
                let _ = player.tx.send(message.clone());
            }
        }
    }

    fn broadcast_all(&self, message: ServerMessage) {
        self.broadcast(message, None);
    }

    fn get_player_infos(&self) -> Vec<PlayerInfo> {
        self.players
            .values()
            .map(|p| PlayerInfo {
                id: p.id.clone(),
                name: p.name.clone(),
            })
            .collect()
    }

    fn is_expired(&self) -> bool {
        let inactive_duration = Utc::now() - self.last_activity;
        self.players.is_empty() && inactive_duration.num_minutes() >= 1
    }

    fn compute_leaderboard(&self) -> Vec<LeaderboardEntry> {
        let num_gates = self.course.gates.len();

        let mut entries: Vec<LeaderboardEntry> = self
            .players
            .values()
            .filter_map(|player| {
                let (lng, lat) = player.position?;

                // Calculate distance to next gate (or finish line)
                let distance = if player.next_gate_index < num_gates {
                    // Distance to next intermediate gate
                    let gate = &self.course.gates[player.next_gate_index];
                    haversine_distance(lat, lng, gate.center.lat, gate.center.lng)
                } else {
                    // Distance to finish line
                    let center = &self.course.finish_line.center;
                    haversine_distance(lat, lng, center.lat, center.lng)
                };

                Some(LeaderboardEntry {
                    player_id: player.id.clone(),
                    player_name: player.name.clone(),
                    next_gate_index: player.next_gate_index,
                    distance_to_next_gate: if player.finish_time.is_some() {
                        0.0
                    } else {
                        distance
                    },
                    finish_time: player.finish_time,
                })
            })
            .collect();

        // Sort: finished first (by time), then by gate progress (more gates = better), then by distance
        entries.sort_by(|a, b| match (&a.finish_time, &b.finish_time) {
            (Some(ta), Some(tb)) => ta.cmp(tb),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => {
                // Higher gate index = further in race = better position
                match b.next_gate_index.cmp(&a.next_gate_index) {
                    std::cmp::Ordering::Equal => a
                        .distance_to_next_gate
                        .partial_cmp(&b.distance_to_next_gate)
                        .unwrap_or(std::cmp::Ordering::Equal),
                    other => other,
                }
            }
        });

        entries
    }

    fn record_gate_crossing(
        &mut self,
        player_id: &str,
        gate_index: usize,
        course_time: i64,
    ) -> Option<FinishedPlayer> {
        let num_gates = self.course.gates.len();
        let player = self.players.get_mut(player_id)?;

        // Validate gate index matches expected next gate
        if gate_index != player.next_gate_index {
            return None;
        }

        // Advance to next gate
        player.next_gate_index = gate_index + 1;

        // Check if this was the finish line crossing
        if gate_index == num_gates {
            player.finish_time = Some(course_time);

            return Some(FinishedPlayer {
                player_id: player.id.clone(),
                player_name: player.name.clone(),
                finish_time: course_time,
                path_history: std::mem::take(&mut player.path_history),
            });
        }

        None
    }
}

/// Data for a player who just finished, ready to be saved
#[derive(Debug)]
struct FinishedPlayer {
    player_id: String,
    player_name: String,
    finish_time: i64,
    path_history: Vec<PathPoint>,
}

/// Calculate distance between two points on Earth using Haversine formula
/// Returns distance in nautical miles
fn haversine_distance(lat1: f64, lng1: f64, lat2: f64, lng2: f64) -> f64 {
    const EARTH_RADIUS_NM: f64 = 3440.065; // Earth radius in nautical miles

    let lat1_rad = lat1.to_radians();
    let lat2_rad = lat2.to_radians();
    let delta_lat = (lat2 - lat1).to_radians();
    let delta_lng = (lng2 - lng1).to_radians();

    let a = (delta_lat / 2.0).sin().powi(2)
        + lat1_rad.cos() * lat2_rad.cos() * (delta_lng / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().asin();

    EARTH_RADIUS_NM * c
}

// ============================================================================
// Race Manager
// ============================================================================

pub type Races = Arc<RwLock<HashMap<String, Race>>>;
pub type PlayerRaceMap = Arc<RwLock<HashMap<String, String>>>;

#[derive(Clone)]
pub struct RaceManager {
    races: Races,
    player_races: PlayerRaceMap,
}

impl RaceManager {
    pub fn new() -> Self {
        let manager = RaceManager {
            races: Arc::new(RwLock::new(HashMap::new())),
            player_races: Arc::new(RwLock::new(HashMap::new())),
        };

        // Spawn cleanup task
        let races_clone = manager.races.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                let mut races = races_clone.write().await;
                races.retain(|_, race| !race.is_expired());
            }
        });

        // Spawn race time update task
        let races_clone = manager.races.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                let races = races_clone.read().await;
                for (race_id, race) in races.iter() {
                    match race.race_start_time {
                        Some(start_time) if !race.race_ended => {
                            // Calculate race time (ms since race start)
                            let now = Utc::now().timestamp_millis();
                            let race_time = race.course.race_time(now - start_time);

                            race.broadcast_all(ServerMessage::SyncRaceTime { race_time });

                            // Check if race time exceeded max
                            if race_time >= race.course.max_finish_time() {
                                {
                                    let mut races = races_clone.write().await;
                                    if let Some(race) = races.get_mut(race_id) {
                                        race.race_ended = true;
                                    }
                                }
                                race.broadcast_all(ServerMessage::RaceEnded {
                                    reason: "Time limit reached".to_string(),
                                });
                                return;
                            }
                        }
                        _ => {}
                    }
                }
            }
        });

        // Spawn leaderboard broadcast task (every 2 seconds)
        let races_clone = manager.races.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

                let races = races_clone.read().await;

                for race in races.values() {
                    if race.race_started() && !race.race_ended {
                        let leaderboard = race.compute_leaderboard();
                        race.broadcast_all(ServerMessage::Leaderboard {
                            entries: leaderboard,
                        });
                    }
                }
            }
        });

        manager
    }

    pub async fn create_race(
        &self,
        course_key: String,
        player_id: String,
        player_name: String,
        tx: mpsc::UnboundedSender<ServerMessage>,
    ) -> anyhow::Result<(String, Vec<WindRasterSource>)> {
        let course = crate::courses::all()
            .into_iter()
            .find(|c| c.key == course_key)
            .ok_or(anyhow!("Course not found"))?;

        let reports = wind_reports::get_reports_for_course(&course)?;
        let rasters: Vec<WindRasterSource> = reports.iter().map(|r| r.into()).collect();

        let race_id = generate_race_id();
        let mut race = Race::new(course, rasters.clone(), player_id.clone());

        let player = Player {
            id: player_id.clone(),
            name: player_name,
            tx,
            position: None,
            heading: 0.0,
            next_gate_index: 0,
            finish_time: None,
            path_history: Vec::new(),
            last_sample_instant: None,
        };
        race.add_player(player)?;

        let mut races = self.races.write().await;
        races.insert(race_id.clone(), race);

        let mut player_races = self.player_races.write().await;
        player_races.insert(player_id, race_id.clone());

        Ok((race_id, rasters))
    }

    pub async fn join_race(
        &self,
        race_id: &str,
        player_id: String,
        player_name: String,
        tx: mpsc::UnboundedSender<ServerMessage>,
    ) -> anyhow::Result<(Vec<PlayerInfo>, Vec<WindRasterSource>, String, bool)> {
        let mut races = self.races.write().await;
        let race = races.get_mut(race_id).ok_or(anyhow!("Race not found"))?;

        let player = Player {
            id: player_id.clone(),
            name: player_name.clone(),
            tx,
            position: None,
            heading: 0.0,
            next_gate_index: 0,
            finish_time: None,
            path_history: Vec::new(),
            last_sample_instant: None,
        };

        // Notify existing players before adding new one
        race.broadcast_all(ServerMessage::PlayerJoined {
            player_id: player_id.clone(),
            player_name,
        });

        let is_creator = race.creator_id == player_id;
        let course_key = race.course.key.clone();
        race.add_player(player)?;

        let players = race.get_player_infos();

        let mut player_races = self.player_races.write().await;
        player_races.insert(player_id, race_id.to_string());

        let rasters = race.wind_raster_sources.clone();

        Ok((players, rasters, course_key, is_creator))
    }

    pub async fn leave_race(&self, player_id: &str) {
        let mut player_races = self.player_races.write().await;
        if let Some(race_id) = player_races.remove(player_id) {
            drop(player_races);

            let mut races = self.races.write().await;
            if let Some(race) = races.get_mut(&race_id) {
                race.remove_player(player_id);
                if race.players.is_empty() {
                    races.remove(&race_id);
                } else {
                    race.broadcast_all(ServerMessage::PlayerLeft {
                        player_id: player_id.to_string(),
                    });
                }
            }
        }
    }

    pub async fn broadcast_position(&self, player_id: &str, lng: f32, lat: f32, heading: f32) {
        let player_races = self.player_races.read().await;
        let Some(race_id) = player_races.get(player_id).cloned() else {
            return;
        };
        drop(player_races);

        // First check with read lock if race has ended
        let (race_started, race_start_time) = {
            let races = self.races.read().await;
            let Some(race) = races.get(&race_id) else {
                return;
            };
            if race.race_ended {
                return;
            }
            (race.race_started(), race.race_start_time)
        };

        // Now get write lock to update player position
        let mut races = self.races.write().await;
        let Some(race) = races.get_mut(&race_id) else {
            return;
        };

        // Update player position and sample path
        if let Some(player) = race.players.get_mut(player_id) {
            player.position = Some((lng as f64, lat as f64));
            player.heading = heading;

            // Sample path if race has started (100ms real-time interval)
            if race_started {
                let now = Instant::now();
                let should_sample = player
                    .last_sample_instant
                    .map(|last| now.duration_since(last) >= Duration::from_millis(100))
                    .unwrap_or(true);

                if should_sample {
                    // Calculate race time
                    let elapsed = Utc::now().timestamp_millis() - race_start_time.unwrap_or(0);
                    let race_time = race.course.race_time(elapsed);

                    player.path_history.push(PathPoint {
                        race_time,
                        lng,
                        lat,
                        heading,
                    });
                    player.last_sample_instant = Some(now);
                }
            }
        }

        // Broadcast to all players except sender
        race.broadcast(
            ServerMessage::PositionUpdate {
                player_id: player_id.to_string(),
                lng,
                lat,
                heading,
            },
            Some(player_id),
        );
    }

    pub async fn record_gate_crossing(
        &self,
        player_id: &str,
        gate_index: usize,
        course_time: i64,
    ) {
        let player_races = self.player_races.read().await;
        let Some(race_id) = player_races.get(player_id).cloned() else {
            return;
        };
        drop(player_races);

        let finished_to_save: Option<(String, i64, FinishedPlayer)> = {
            let mut races = self.races.write().await;
            let Some(race) = races.get_mut(&race_id) else {
                return;
            };

            if let Some(finished) = race.record_gate_crossing(player_id, gate_index, course_time) {
                Some((
                    race.course.key.clone(),
                    race.course.start_time,
                    finished,
                ))
            } else {
                None
            }
        };

        // Save finished player outside the lock
        if let Some((course_key, race_start_time, finished)) = finished_to_save {
            tokio::spawn(save_race_result(course_key, race_start_time, finished));
        }
    }

    pub async fn start_race(&self, player_id: &str) -> anyhow::Result<()> {
        let player_races = self.player_races.read().await;
        let race_id = player_races
            .get(player_id)
            .ok_or(anyhow!("Player not in a race"))?
            .clone();
        drop(player_races);

        // Validate and mark race as started
        {
            let mut races = self.races.write().await;
            let race = races.get_mut(&race_id).ok_or(anyhow!("Race not found"))?;

            if race.creator_id != player_id {
                return Err(anyhow!("Only the race creator can start the race"));
            }

            if race.race_started() {
                return Err(anyhow!("Race has already started"));
            }
        }

        // Countdown (release lock between each second)
        for seconds in (1..=3).rev() {
            {
                let races = self.races.read().await;
                if let Some(race) = races.get(&race_id) {
                    if race.players.is_empty() {
                        return Err(anyhow!("All players left"));
                    }
                    race.broadcast_all(ServerMessage::RaceCountdown { seconds });
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }

        // Send race started and store start time
        {
            let mut races = self.races.write().await;
            if let Some(race) = races.get_mut(&race_id) {
                let start_time = Utc::now().timestamp_millis();
                race.race_start_time = Some(start_time);
                race.broadcast_all(ServerMessage::RaceCountdown { seconds: 0 });
            }
        }

        Ok(())
    }
}

/// Public race info for listing
#[derive(Debug, Clone, Serialize)]
pub struct RaceInfo {
    pub id: String,
    pub course_key: String,
    pub players: Vec<PlayerInfo>,
    pub max_players: usize,
    pub race_started: bool,
    pub creator_id: String,
}

impl RaceManager {
    pub async fn list_races(&self) -> Vec<RaceInfo> {
        let races = self.races.read().await;
        races
            .iter()
            .filter(|(_, race)| !race.race_started()) // Only show races that haven't started
            .map(|(id, race)| RaceInfo {
                id: id.clone(),
                course_key: race.course.key.clone(),
                max_players: race.max_players,
                race_started: race.race_started(),
                creator_id: race.creator_id.clone(),
                players: race.players.values().map(|player| player.info()).collect(),
            })
            .collect::<Vec<_>>()
    }
}

fn generate_id() -> String {
    let bytes: [u8; 8] = rand::rng().random();
    bytes.iter().map(|b| format!("{:02X}", b)).collect()
}

fn generate_race_id() -> String {
    generate_id()[..6].to_string()
}

/// Save a finished player's race result to database and S3
async fn save_race_result(course_key: String, race_start_time: i64, finished: FinishedPlayer) {
    let s3_key = format!(
        "paths/{}/{}_{}.bin",
        course_key, race_start_time, finished.player_id
    );

    // Encode path to binary
    let path_data = race_results::encode_path(&finished.path_history);

    // Upload to S3
    let client = s3::paths_client();
    if let Err(e) = client
        .put(
            &object_store::path::Path::from(s3_key.clone()),
            Bytes::from(path_data).into(),
        )
        .await
    {
        log::error!("Failed to upload race path to S3: {}", e);
        return;
    }

    // Save to database
    if let Err(e) = db::with_connection(|conn| {
        race_results::save_result(
            conn,
            &course_key,
            &finished.player_name,
            finished.finish_time,
            race_start_time,
            &s3_key,
        )?;
        Ok(())
    }) {
        log::error!("Failed to save race result to database: {}", e);
        return;
    }

    log::info!(
        "Saved race result: {} finished {} in {}ms",
        finished.player_name,
        course_key,
        finished.finish_time
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // generate_id / generate_lobby_id tests
    // =========================================================================

    #[test]
    fn test_generate_id_format() {
        let id = generate_id();
        // Should be 16 hex characters (8 bytes * 2 chars each)
        assert_eq!(id.len(), 16);
        // Should be valid uppercase hex
        assert!(
            id.chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_lowercase())
        );
    }

    #[test]
    fn test_generate_id_uniqueness() {
        let ids: Vec<String> = (0..100).map(|_| generate_id()).collect();
        let unique: std::collections::HashSet<_> = ids.iter().collect();
        // All IDs should be unique (with overwhelming probability)
        assert_eq!(ids.len(), unique.len());
    }

    #[test]
    fn test_generate_race_id_format() {
        let id = generate_race_id();
        // Should be 6 hex characters
        assert_eq!(id.len(), 6);
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
    }

    // =========================================================================
    // Race tests
    // =========================================================================

    fn make_test_player(id: &str, name: &str) -> Player {
        let (tx, _rx) = mpsc::unbounded_channel();
        Player {
            id: id.to_string(),
            name: name.to_string(),
            tx,
            position: None,
            heading: 0.0,
            next_gate_index: 0,
            finish_time: None,
            path_history: Vec::new(),
            last_sample_instant: None,
        }
    }

    fn make_test_course() -> Course {
        use crate::courses::Gate;
        Course {
            key: "vg20".to_string(),
            name: "Vendee Globe 2020".to_string(),
            description: "Test course".to_string(),
            polar: "vr-imoca-full-pack".to_string(),
            start_time: 1604833200000,
            start: crate::courses::LngLat {
                lng: -1.788,
                lat: 46.470,
            },
            start_heading: 270.0,
            finish_line: Gate::horizontal(-1.788, 46.470, 24.0),
            gates: vec![],
            exclusion_zones: vec![],
            route_waypoints: vec![vec![]],
            time_factor: 2000,
            max_days: 90,
        }
    }

    fn make_test_wind_raster() -> WindRasterSource {
        WindRasterSource {
            time: DateTime::from_timestamp_millis(1604833200000).unwrap(),
            png_url: "https://s3/bucket/path/to/png1".to_string(),
        }
    }

    fn make_test_race() -> Race {
        Race::new(
            make_test_course(),
            vec![make_test_wind_raster()],
            "creator-1".to_string(),
        )
    }

    #[test]
    fn test_race_new() {
        let race = make_test_race();

        assert_eq!(race.course.key, "vg20");
        assert_eq!(race.creator_id, "creator-1");
        assert_eq!(race.max_players, 10);
        assert!(race.race_start_time.is_none());
        assert!(race.players.is_empty());
    }

    #[test]
    fn test_race_add_player() {
        let mut race = make_test_race();
        let player = make_test_player("player-1", "Alice");

        let result = race.add_player(player);

        assert!(result.is_ok());
        assert_eq!(race.players.len(), 1);
        assert!(race.players.contains_key("player-1"));
    }

    #[test]
    fn test_race_add_player_updates_activity() {
        let mut race = make_test_race();
        let initial_activity = race.last_activity;

        // Small delay to ensure time difference
        std::thread::sleep(std::time::Duration::from_millis(10));

        let player = make_test_player("player-1", "Alice");
        race.add_player(player).unwrap();

        assert!(race.last_activity > initial_activity);
    }

    #[test]
    fn test_race_add_player_fails_when_race_started() {
        let mut race = make_test_race();
        race.race_start_time = Some(Utc::now().timestamp_millis());

        let player = make_test_player("player-1", "Alice");
        let result = race.add_player(player);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Race has already started");
    }

    #[test]
    fn test_race_add_player_fails_when_full() {
        let mut race = make_test_race();

        // Add max_players
        for i in 0..race.max_players {
            let player = make_test_player(&format!("player-{}", i), &format!("Player {}", i));
            race.add_player(player).unwrap();
        }

        // Next player should fail
        let extra_player = make_test_player("extra", "Extra");
        let result = race.add_player(extra_player);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Race is full");
    }

    #[test]
    fn test_race_remove_player() {
        let mut race = make_test_race();
        let player = make_test_player("player-1", "Alice");
        race.add_player(player).unwrap();

        let removed = race.remove_player("player-1");

        assert!(removed.is_some());
        assert_eq!(removed.unwrap().name, "Alice");
        assert!(race.players.is_empty());
    }

    #[test]
    fn test_race_remove_nonexistent_player() {
        let mut race = make_test_race();

        let removed = race.remove_player("nonexistent");

        assert!(removed.is_none());
    }

    #[test]
    fn test_race_is_expired_empty_and_old() {
        let mut race = make_test_race();
        // Set last activity to 6 minutes ago
        race.last_activity = Utc::now() - chrono::Duration::minutes(6);

        assert!(race.is_expired());
    }

    #[test]
    fn test_race_is_not_expired_with_players() {
        let mut race = make_test_race();
        race.last_activity = Utc::now() - chrono::Duration::minutes(6);

        // Add a player
        let player = make_test_player("player-1", "Alice");
        race.players.insert("player-1".to_string(), player);

        // Should not be expired because it has players
        assert!(!race.is_expired());
    }

    #[test]
    fn test_race_is_not_expired_recent_activity() {
        let race = make_test_race();
        // Fresh race with no players

        // Should not be expired because activity is recent
        assert!(!race.is_expired());
    }

    #[test]
    fn test_race_get_player_infos() {
        let mut race = make_test_race();
        race.add_player(make_test_player("p1", "Alice")).unwrap();
        race.add_player(make_test_player("p2", "Bob")).unwrap();

        let infos = race.get_player_infos();

        assert_eq!(infos.len(), 2);
        let names: Vec<&str> = infos.iter().map(|i| i.name.as_str()).collect();
        assert!(names.contains(&"Alice"));
        assert!(names.contains(&"Bob"));
    }

    // =========================================================================
    // RaceManager tests (async)
    // =========================================================================

    #[tokio::test]
    async fn test_race_manager_create_race() {
        let manager = RaceManager::new();
        let (tx, _rx) = mpsc::unbounded_channel();

        let result = manager
            .create_race(
                "vg20".to_string(),
                "player-1".to_string(),
                "Alice".to_string(),
                tx,
            )
            .await;

        assert!(result.is_ok());
        let (race_id, _) = result.unwrap();
        assert_eq!(race_id.len(), 6);

        // Verify race exists
        let races = manager.races.read().await;
        assert!(races.contains_key(&race_id));
    }

    #[tokio::test]
    async fn test_race_manager_join_race() {
        let manager = RaceManager::new();
        let (tx1, _rx1) = mpsc::unbounded_channel();
        let (tx2, _rx2) = mpsc::unbounded_channel();

        // Create race
        let (race_id, _) = manager
            .create_race(
                "vg20".to_string(),
                "player-1".to_string(),
                "Alice".to_string(),
                tx1,
            )
            .await
            .unwrap();

        // Join race
        let result = manager
            .join_race(&race_id, "player-2".to_string(), "Bob".to_string(), tx2)
            .await;

        assert!(result.is_ok());
        let (players, rasters, course_key, is_creator) = result.unwrap();
        assert_eq!(course_key, "vg20");
        assert!(rasters.is_empty());
        assert!(!is_creator);
        assert_eq!(players.len(), 2); // Alice and Bob
    }

    #[tokio::test]
    async fn test_race_manager_join_nonexistent_race() {
        let manager = RaceManager::new();
        let (tx, _rx) = mpsc::unbounded_channel();

        let result = manager
            .join_race("AAAAAA", "player-1".to_string(), "Alice".to_string(), tx)
            .await;

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "Race not found".to_string()
        );
    }

    #[tokio::test]
    async fn test_race_manager_leave_race() {
        let manager = RaceManager::new();
        let (tx, _rx) = mpsc::unbounded_channel();

        let (race_id, _) = manager
            .create_race(
                "vg20".to_string(),
                "player-1".to_string(),
                "Alice".to_string(),
                tx,
            )
            .await
            .unwrap();

        // Leave race
        manager.leave_race("player-1").await;

        // Verify race is removed (empty race gets cleaned up)
        let races = manager.races.read().await;
        assert!(!races.contains_key(&race_id));
    }

    #[tokio::test]
    async fn test_race_manager_list_races() {
        let manager = RaceManager::new();
        let (tx1, _rx1) = mpsc::unbounded_channel();
        let (tx2, _rx2) = mpsc::unbounded_channel();

        manager
            .create_race(
                "vg20".to_string(),
                "player-1".to_string(),
                "Alice".to_string(),
                tx1,
            )
            .await
            .unwrap();

        manager
            .create_race(
                "vg20".to_string(),
                "player-2".to_string(),
                "Bob".to_string(),
                tx2,
            )
            .await
            .unwrap();

        let races = manager.list_races().await;

        assert_eq!(races.len(), 2);
    }

    #[tokio::test]
    async fn test_race_manager_list_races_excludes_started() {
        let manager = RaceManager::new();
        let (tx, _rx) = mpsc::unbounded_channel();

        let (race_id, _) = manager
            .create_race(
                "vg20".to_string(),
                "player-1".to_string(),
                "Alice".to_string(),
                tx,
            )
            .await
            .unwrap();

        // Mark race as started
        {
            let mut races = manager.races.write().await;
            races.get_mut(&race_id).unwrap().race_start_time = Some(Utc::now().timestamp_millis());
        }

        let races = manager.list_races().await;

        assert!(races.is_empty());
    }
}

// ============================================================================
// WebSocket Handler
// ============================================================================

pub async fn handle_websocket(ws: WebSocket, manager: RaceManager) {
    let (mut ws_tx, mut ws_rx) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<ServerMessage>();

    let player_id = generate_id();

    // Task to forward server messages to WebSocket
    let forward_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if let Ok(json) = serde_json::to_string(&msg) {
                if ws_tx.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    // Process incoming messages
    while let Some(result) = ws_rx.next().await {
        match result {
            Ok(msg) => match msg {
                Message::Text(text) => match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(client_msg) => {
                        handle_client_message(&manager, &player_id, tx.clone(), client_msg).await;
                    }
                    Err(err) => {
                        log::error!("Failed to decode message: {}", err);
                    }
                },
                Message::Close(_) => break,
                _ => {}
            },
            Err(_) => break,
        }
    }

    // Cleanup on disconnect
    manager.leave_race(&player_id).await;
    forward_task.abort();
}

async fn handle_client_message(
    manager: &RaceManager,
    player_id: &str,
    tx: mpsc::UnboundedSender<ServerMessage>,
    message: ClientMessage,
) {
    let result: anyhow::Result<()> = match message {
        ClientMessage::CreateRace {
            course_key,
            player_name,
        } => {
            match manager
                .create_race(course_key, player_id.to_string(), player_name, tx.clone())
                .await
            {
                Ok((race_id, rasters)) => {
                    let _ = tx.send(ServerMessage::RaceCreated {
                        race_id,
                        player_id: player_id.to_string(),
                        wind_raster_sources: rasters,
                    });
                    Ok(())
                }
                Err(e) => Err(e),
            }
        }

        ClientMessage::JoinRace {
            race_id,
            player_name,
        } => {
            match manager
                .join_race(&race_id, player_id.to_string(), player_name, tx.clone())
                .await
            {
                Ok((players, rasters, course_key, is_creator)) => {
                    let _ = tx.send(ServerMessage::RaceJoined {
                        race_id,
                        player_id: player_id.to_string(),
                        course_key,
                        wind_raster_sources: rasters,
                        players,
                        is_creator,
                    });
                    Ok(())
                }
                Err(e) => Err(e),
            }
        }

        ClientMessage::LeaveRace => {
            manager.leave_race(player_id).await;
            Ok(())
        }

        ClientMessage::StartRace => manager.start_race(player_id).await,

        ClientMessage::PositionUpdate { lng, lat, heading } => {
            manager
                .broadcast_position(player_id, lng, lat, heading)
                .await;
            Ok(())
        }

        ClientMessage::GateCrossed {
            gate_index,
            course_time,
        } => {
            manager
                .record_gate_crossing(player_id, gate_index, course_time)
                .await;
            Ok(())
        }
    };

    if let Err(error) = result {
        log::error!("Failed to handle client message: {}", error.to_string());
        let _ = tx.send(ServerMessage::Error {
            message: error.to_string(),
        });
    }
}

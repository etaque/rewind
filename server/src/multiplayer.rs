use axum::extract::ws::{Message, WebSocket};
use chrono::{DateTime, Utc};
use futures::{SinkExt, StreamExt};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};

// ============================================================================
// Message Types
// ============================================================================

/// Messages sent from client to server
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
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
}

/// Messages sent from server to client
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    Error {
        message: String,
    },
    RaceCreated {
        race_id: String,
        player_id: String,
    },
    RaceJoined {
        race_id: String,
        player_id: String,
        course_key: String,
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
    RaceStarted {
        start_time: i64,
        course_key: String,
    },
    PositionUpdate {
        player_id: String,
        lng: f32,
        lat: f32,
        heading: f32,
        race_time: i64,
    },
    RaceEnded {
        reason: String,
    },
    Leaderboard {
        entries: Vec<LeaderboardEntry>,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct LeaderboardEntry {
    pub player_id: String,
    pub player_name: String,
    pub distance_to_finish: f64,
}

#[derive(Debug, Clone, Serialize)]
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
    pub course_key: String,
    pub creator_id: String,
    pub players: HashMap<String, Player>,
    pub max_players: usize,
    pub race_started: bool,
    pub race_start_time: Option<i64>,
    pub race_ended: bool,
    pub max_race_time: i64,
    pub last_activity: DateTime<Utc>,
    pub finish: (f64, f64), // (lng, lat)
}

impl Race {
    fn new(course_key: String, creator_id: String, max_race_time: i64, finish: (f64, f64)) -> Self {
        Race {
            course_key,
            creator_id,
            players: HashMap::new(),
            max_players: 10,
            race_started: false,
            race_start_time: None,
            race_ended: false,
            max_race_time,
            last_activity: Utc::now(),
            finish,
        }
    }

    fn add_player(&mut self, player: Player) -> Result<(), String> {
        if self.race_started {
            return Err("Race has already started".to_string());
        }
        if self.players.len() >= self.max_players {
            return Err("Race is full".to_string());
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
        self.players.is_empty() && inactive_duration.num_minutes() >= 5
    }

    fn compute_leaderboard(&self) -> Vec<LeaderboardEntry> {
        let mut entries: Vec<LeaderboardEntry> = self
            .players
            .values()
            .filter_map(|player| {
                player.position.map(|(lng, lat)| LeaderboardEntry {
                    player_id: player.id.clone(),
                    player_name: player.name.clone(),
                    distance_to_finish: haversine_distance(lat, lng, self.finish.1, self.finish.0),
                })
            })
            .collect();

        // Sort by distance (closest first)
        entries.sort_by(|a, b| {
            a.distance_to_finish
                .partial_cmp(&b.distance_to_finish)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        entries
    }
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
                tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                let mut races = races_clone.write().await;
                races.retain(|_, race| !race.is_expired());
            }
        });

        // Spawn leaderboard broadcast task (every 2 seconds)
        let races_clone = manager.races.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                let races = races_clone.read().await;
                for race in races.values() {
                    if race.race_started && !race.race_ended {
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
    ) -> Result<String, String> {
        // Look up course to get max_days and finish
        let course = crate::courses::all()
            .into_iter()
            .find(|c| c.key == course_key)
            .ok_or_else(|| "Course not found".to_string())?;

        // Convert max_days to milliseconds
        let max_race_time = course.max_days as i64 * 24 * 60 * 60 * 1000;
        let finish = (course.finish.lng, course.finish.lat);

        let race_id = generate_race_id();
        let mut race = Race::new(course_key, player_id.clone(), max_race_time, finish);

        let player = Player {
            id: player_id.clone(),
            name: player_name,
            tx,
            position: None,
        };
        race.add_player(player)?;

        let mut races = self.races.write().await;
        races.insert(race_id.clone(), race);

        let mut player_races = self.player_races.write().await;
        player_races.insert(player_id, race_id.clone());

        Ok(race_id)
    }

    pub async fn join_race(
        &self,
        race_id: &str,
        player_id: String,
        player_name: String,
        tx: mpsc::UnboundedSender<ServerMessage>,
    ) -> Result<(Vec<PlayerInfo>, String, bool), String> {
        let mut races = self.races.write().await;
        let race = races
            .get_mut(race_id)
            .ok_or_else(|| "Race not found".to_string())?;

        let player = Player {
            id: player_id.clone(),
            name: player_name.clone(),
            tx,
            position: None,
        };

        // Notify existing players before adding new one
        race.broadcast_all(ServerMessage::PlayerJoined {
            player_id: player_id.clone(),
            player_name,
        });

        let is_creator = race.creator_id == player_id;
        let course_key = race.course_key.clone();
        race.add_player(player)?;

        let players = race.get_player_infos();

        let mut player_races = self.player_races.write().await;
        player_races.insert(player_id, race_id.to_string());

        Ok((players, course_key, is_creator))
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
        {
            let races = self.races.read().await;
            let Some(race) = races.get(&race_id) else {
                return;
            };
            if race.race_ended {
                return;
            }
        }

        // Now get write lock to potentially end the race
        let mut races = self.races.write().await;
        let Some(race) = races.get_mut(&race_id) else {
            return;
        };

        // Update player position
        if let Some(player) = race.players.get_mut(player_id) {
            player.position = Some((lng as f64, lat as f64));
        }

        // Calculate race time (ms since race start)
        let race_time = race
            .race_start_time
            .map(|start| Utc::now().timestamp_millis() - start)
            .unwrap_or(0);

        // Check if race time exceeded max
        if race_time >= race.max_race_time {
            race.race_ended = true;
            race.broadcast_all(ServerMessage::RaceEnded {
                reason: "Time limit reached".to_string(),
            });
            return;
        }

        // Broadcast to all players except sender
        race.broadcast(
            ServerMessage::PositionUpdate {
                player_id: player_id.to_string(),
                lng,
                lat,
                heading,
                race_time,
            },
            Some(player_id),
        );
    }

    pub async fn start_race(&self, player_id: &str) -> Result<(), String> {
        let player_races = self.player_races.read().await;
        let race_id = player_races
            .get(player_id)
            .ok_or_else(|| "Player not in a race".to_string())?
            .clone();
        drop(player_races);

        // Validate and mark race as started
        let course_key = {
            let mut races = self.races.write().await;
            let race = races
                .get_mut(&race_id)
                .ok_or_else(|| "Race not found".to_string())?;

            if race.creator_id != player_id {
                return Err("Only the race creator can start the race".to_string());
            }

            if race.race_started {
                return Err("Race has already started".to_string());
            }

            race.race_started = true;
            race.course_key.clone()
        };

        // Countdown (release lock between each second)
        for seconds in (1..=3).rev() {
            {
                let races = self.races.read().await;
                if let Some(race) = races.get(&race_id) {
                    if race.players.is_empty() {
                        return Err("All players left".to_string());
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
                race.broadcast_all(ServerMessage::RaceStarted {
                    start_time,
                    course_key,
                });
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
            .filter(|(_, race)| !race.race_started) // Only show races that haven't started
            .map(|(id, race)| RaceInfo {
                id: id.clone(),
                course_key: race.course_key.clone(),
                max_players: race.max_players,
                race_started: race.race_started,
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
        assert!(id
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_lowercase()));
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
        }
    }

    #[test]
    fn test_race_new() {
        let race = Race::new(
            "vg20".to_string(),
            "creator-1".to_string(),
            90 * 24 * 60 * 60 * 1000,
            (-1.788, 46.470),
        );

        assert_eq!(race.course_key, "vg20");
        assert_eq!(race.creator_id, "creator-1");
        assert_eq!(race.max_players, 10);
        assert!(!race.race_started);
        assert!(race.players.is_empty());
    }

    #[test]
    fn test_race_add_player() {
        let mut race = Race::new(
            "vg20".to_string(),
            "creator-1".to_string(),
            90 * 24 * 60 * 60 * 1000,
            (-1.788, 46.470),
        );
        let player = make_test_player("player-1", "Alice");

        let result = race.add_player(player);

        assert!(result.is_ok());
        assert_eq!(race.players.len(), 1);
        assert!(race.players.contains_key("player-1"));
    }

    #[test]
    fn test_race_add_player_updates_activity() {
        let mut race = Race::new(
            "vg20".to_string(),
            "creator-1".to_string(),
            90 * 24 * 60 * 60 * 1000,
            (-1.788, 46.470),
        );
        let initial_activity = race.last_activity;

        // Small delay to ensure time difference
        std::thread::sleep(std::time::Duration::from_millis(10));

        let player = make_test_player("player-1", "Alice");
        race.add_player(player).unwrap();

        assert!(race.last_activity > initial_activity);
    }

    #[test]
    fn test_race_add_player_fails_when_race_started() {
        let mut race = Race::new(
            "vg20".to_string(),
            "creator-1".to_string(),
            90 * 24 * 60 * 60 * 1000,
            (-1.788, 46.470),
        );
        race.race_started = true;

        let player = make_test_player("player-1", "Alice");
        let result = race.add_player(player);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Race has already started");
    }

    #[test]
    fn test_race_add_player_fails_when_full() {
        let mut race = Race::new(
            "vg20".to_string(),
            "creator-1".to_string(),
            90 * 24 * 60 * 60 * 1000,
            (-1.788, 46.470),
        );

        // Add max_players
        for i in 0..race.max_players {
            let player = make_test_player(&format!("player-{}", i), &format!("Player {}", i));
            race.add_player(player).unwrap();
        }

        // Next player should fail
        let extra_player = make_test_player("extra", "Extra");
        let result = race.add_player(extra_player);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Race is full");
    }

    #[test]
    fn test_race_remove_player() {
        let mut race = Race::new(
            "vg20".to_string(),
            "creator-1".to_string(),
            90 * 24 * 60 * 60 * 1000,
            (-1.788, 46.470),
        );
        let player = make_test_player("player-1", "Alice");
        race.add_player(player).unwrap();

        let removed = race.remove_player("player-1");

        assert!(removed.is_some());
        assert_eq!(removed.unwrap().name, "Alice");
        assert!(race.players.is_empty());
    }

    #[test]
    fn test_race_remove_nonexistent_player() {
        let mut race = Race::new(
            "vg20".to_string(),
            "creator-1".to_string(),
            90 * 24 * 60 * 60 * 1000,
            (-1.788, 46.470),
        );

        let removed = race.remove_player("nonexistent");

        assert!(removed.is_none());
    }

    #[test]
    fn test_race_is_expired_empty_and_old() {
        let mut race = Race::new(
            "vg20".to_string(),
            "creator-1".to_string(),
            90 * 24 * 60 * 60 * 1000,
            (-1.788, 46.470),
        );
        // Set last activity to 6 minutes ago
        race.last_activity = Utc::now() - chrono::Duration::minutes(6);

        assert!(race.is_expired());
    }

    #[test]
    fn test_race_is_not_expired_with_players() {
        let mut race = Race::new(
            "vg20".to_string(),
            "creator-1".to_string(),
            90 * 24 * 60 * 60 * 1000,
            (-1.788, 46.470),
        );
        race.last_activity = Utc::now() - chrono::Duration::minutes(6);

        // Add a player
        let player = make_test_player("player-1", "Alice");
        race.players.insert("player-1".to_string(), player);

        // Should not be expired because it has players
        assert!(!race.is_expired());
    }

    #[test]
    fn test_race_is_not_expired_recent_activity() {
        let race = Race::new(
            "vg20".to_string(),
            "creator-1".to_string(),
            90 * 24 * 60 * 60 * 1000,
            (-1.788, 46.470),
        );
        // Fresh race with no players

        // Should not be expired because activity is recent
        assert!(!race.is_expired());
    }

    #[test]
    fn test_race_get_player_infos() {
        let mut race = Race::new(
            "vg20".to_string(),
            "creator-1".to_string(),
            90 * 24 * 60 * 60 * 1000,
            (-1.788, 46.470),
        );
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
        let race_id = result.unwrap();
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
        let race_id = manager
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
        let (players, course_key, is_creator) = result.unwrap();
        assert_eq!(course_key, "vg20");
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
        assert_eq!(result.unwrap_err(), "Race not found");
    }

    #[tokio::test]
    async fn test_race_manager_leave_race() {
        let manager = RaceManager::new();
        let (tx, _rx) = mpsc::unbounded_channel();

        let race_id = manager
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

        let race_id = manager
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
            races.get_mut(&race_id).unwrap().race_started = true;
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
                Message::Text(text) => {
                    if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                        handle_client_message(&manager, &player_id, tx.clone(), client_msg).await;
                    }
                }
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
    let result: Result<(), String> = match message {
        ClientMessage::CreateRace {
            course_key,
            player_name,
        } => {
            match manager
                .create_race(course_key, player_id.to_string(), player_name, tx.clone())
                .await
            {
                Ok(race_id) => {
                    let _ = tx.send(ServerMessage::RaceCreated {
                        race_id,
                        player_id: player_id.to_string(),
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
                Ok((players, course_key, is_creator)) => {
                    let _ = tx.send(ServerMessage::RaceJoined {
                        race_id,
                        player_id: player_id.to_string(),
                        course_key,
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
    };

    if let Err(error_message) = result {
        let _ = tx.send(ServerMessage::Error {
            message: error_message,
        });
    }
}

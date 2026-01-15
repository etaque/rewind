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
    CreateLobby {
        course_key: String,
        player_name: String,
    },
    JoinLobby {
        lobby_id: String,
        player_name: String,
    },
    LeaveLobby,
    Offer {
        target_player_id: String,
        sdp: String,
    },
    Answer {
        target_player_id: String,
        sdp: String,
    },
    IceCandidate {
        target_player_id: String,
        candidate: String,
    },
    StartRace,
}

/// Messages sent from server to client
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    Error {
        message: String,
    },
    LobbyCreated {
        lobby_id: String,
        player_id: String,
    },
    LobbyJoined {
        lobby_id: String,
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
    Offer {
        from_player_id: String,
        sdp: String,
    },
    Answer {
        from_player_id: String,
        sdp: String,
    },
    IceCandidate {
        from_player_id: String,
        candidate: String,
    },
    RaceCountdown {
        seconds: i32,
    },
    RaceStarted {
        start_time: i64,
        course_key: String,
    },
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
pub struct Lobby {
    pub course_key: String,
    pub creator_id: String,
    pub players: HashMap<String, Player>,
    pub max_players: usize,
    pub race_started: bool,
    pub last_activity: DateTime<Utc>,
}

impl Lobby {
    fn new(course_key: String, creator_id: String) -> Self {
        Lobby {
            course_key,
            creator_id,
            players: HashMap::new(),
            max_players: 10,
            race_started: false,
            last_activity: Utc::now(),
        }
    }

    fn add_player(&mut self, player: Player) -> Result<(), String> {
        if self.race_started {
            return Err("Race has already started".to_string());
        }
        if self.players.len() >= self.max_players {
            return Err("Lobby is full".to_string());
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
}

// ============================================================================
// Lobby Manager
// ============================================================================

pub type Lobbies = Arc<RwLock<HashMap<String, Lobby>>>;
pub type PlayerLobbyMap = Arc<RwLock<HashMap<String, String>>>;

#[derive(Clone)]
pub struct LobbyManager {
    lobbies: Lobbies,
    player_lobbies: PlayerLobbyMap,
}

impl LobbyManager {
    pub fn new() -> Self {
        let manager = LobbyManager {
            lobbies: Arc::new(RwLock::new(HashMap::new())),
            player_lobbies: Arc::new(RwLock::new(HashMap::new())),
        };

        // Spawn cleanup task
        let lobbies_clone = manager.lobbies.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                let mut lobbies = lobbies_clone.write().await;
                lobbies.retain(|_, lobby| !lobby.is_expired());
            }
        });

        manager
    }

    pub async fn create_lobby(
        &self,
        course_key: String,
        player_id: String,
        player_name: String,
        tx: mpsc::UnboundedSender<ServerMessage>,
    ) -> Result<String, String> {
        let lobby_id = generate_lobby_id();
        let mut lobby = Lobby::new(course_key, player_id.clone());

        let player = Player {
            id: player_id.clone(),
            name: player_name,
            tx,
        };
        lobby.add_player(player)?;

        let mut lobbies = self.lobbies.write().await;
        lobbies.insert(lobby_id.clone(), lobby);

        let mut player_lobbies = self.player_lobbies.write().await;
        player_lobbies.insert(player_id, lobby_id.clone());

        Ok(lobby_id)
    }

    pub async fn join_lobby(
        &self,
        lobby_id: &str,
        player_id: String,
        player_name: String,
        tx: mpsc::UnboundedSender<ServerMessage>,
    ) -> Result<(Vec<PlayerInfo>, String, bool), String> {
        let mut lobbies = self.lobbies.write().await;
        let lobby = lobbies
            .get_mut(lobby_id)
            .ok_or_else(|| "Lobby not found".to_string())?;

        let player = Player {
            id: player_id.clone(),
            name: player_name.clone(),
            tx,
        };

        // Notify existing players before adding new one
        lobby.broadcast_all(ServerMessage::PlayerJoined {
            player_id: player_id.clone(),
            player_name,
        });

        let is_creator = lobby.creator_id == player_id;
        let course_key = lobby.course_key.clone();
        lobby.add_player(player)?;

        let players = lobby.get_player_infos();

        let mut player_lobbies = self.player_lobbies.write().await;
        player_lobbies.insert(player_id, lobby_id.to_string());

        Ok((players, course_key, is_creator))
    }

    pub async fn leave_lobby(&self, player_id: &str) {
        let mut player_lobbies = self.player_lobbies.write().await;
        if let Some(lobby_id) = player_lobbies.remove(player_id) {
            drop(player_lobbies);

            let mut lobbies = self.lobbies.write().await;
            if let Some(lobby) = lobbies.get_mut(&lobby_id) {
                lobby.remove_player(player_id);
                if lobby.players.is_empty() {
                    lobbies.remove(&lobby_id);
                } else {
                    lobby.broadcast_all(ServerMessage::PlayerLeft {
                        player_id: player_id.to_string(),
                    });
                }
            }
        }
    }

    pub async fn forward_to_player(
        &self,
        from_player_id: &str,
        target_player_id: &str,
        message: ServerMessage,
    ) -> Result<(), String> {
        let player_lobbies = self.player_lobbies.read().await;
        let lobby_id = player_lobbies
            .get(from_player_id)
            .ok_or_else(|| "Player not in a lobby".to_string())?;

        let lobbies = self.lobbies.read().await;
        let lobby = lobbies
            .get(lobby_id)
            .ok_or_else(|| "Lobby not found".to_string())?;

        let target = lobby
            .players
            .get(target_player_id)
            .ok_or_else(|| "Target player not found".to_string())?;

        target
            .tx
            .send(message)
            .map_err(|_| "Failed to send message".to_string())
    }

    pub async fn start_race(&self, player_id: &str) -> Result<(), String> {
        let player_lobbies = self.player_lobbies.read().await;
        let lobby_id = player_lobbies
            .get(player_id)
            .ok_or_else(|| "Player not in a lobby".to_string())?
            .clone();
        drop(player_lobbies);

        // Validate and mark race as started
        let course_key = {
            let mut lobbies = self.lobbies.write().await;
            let lobby = lobbies
                .get_mut(&lobby_id)
                .ok_or_else(|| "Lobby not found".to_string())?;

            if lobby.creator_id != player_id {
                return Err("Only the lobby creator can start the race".to_string());
            }

            if lobby.race_started {
                return Err("Race has already started".to_string());
            }

            lobby.race_started = true;
            lobby.course_key.clone()
        };

        // Countdown (release lock between each second)
        for seconds in (1..=3).rev() {
            {
                let lobbies = self.lobbies.read().await;
                if let Some(lobby) = lobbies.get(&lobby_id) {
                    if lobby.players.is_empty() {
                        return Err("All players left".to_string());
                    }
                    lobby.broadcast_all(ServerMessage::RaceCountdown { seconds });
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }

        // Send race started
        {
            let lobbies = self.lobbies.read().await;
            if let Some(lobby) = lobbies.get(&lobby_id) {
                let start_time = Utc::now().timestamp_millis();
                lobby.broadcast_all(ServerMessage::RaceStarted {
                    start_time,
                    course_key,
                });
            }
        }

        Ok(())
    }
}

/// Public lobby info for listing
#[derive(Debug, Clone, Serialize)]
pub struct LobbyInfo {
    pub id: String,
    pub course_key: String,
    pub players: Vec<PlayerInfo>,
    pub max_players: usize,
    pub race_started: bool,
    pub creator_id: String,
}

impl LobbyManager {
    pub async fn list_lobbies(&self) -> Vec<LobbyInfo> {
        let lobbies = self.lobbies.read().await;
        lobbies
            .iter()
            .filter(|(_, lobby)| !lobby.race_started) // Only show lobbies that haven't started
            .map(|(id, lobby)| LobbyInfo {
                id: id.clone(),
                course_key: lobby.course_key.clone(),
                max_players: lobby.max_players,
                race_started: lobby.race_started,
                creator_id: lobby.creator_id.clone(),
                players: lobby.players.values().map(|player| player.info()).collect(),
            })
            .collect::<Vec<_>>()
    }
}

fn generate_id() -> String {
    let bytes: [u8; 8] = rand::rng().random();
    bytes.iter().map(|b| format!("{:02X}", b)).collect()
}

fn generate_lobby_id() -> String {
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
    fn test_generate_lobby_id_format() {
        let id = generate_lobby_id();
        // Should be 6 hex characters
        assert_eq!(id.len(), 6);
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
    }

    // =========================================================================
    // Lobby tests
    // =========================================================================

    fn make_test_player(id: &str, name: &str) -> Player {
        let (tx, _rx) = mpsc::unbounded_channel();
        Player {
            id: id.to_string(),
            name: name.to_string(),
            tx,
        }
    }

    #[test]
    fn test_lobby_new() {
        let lobby = Lobby::new("vendee-2020".to_string(), "creator-1".to_string());

        assert_eq!(lobby.course_key, "vendee-2020");
        assert_eq!(lobby.creator_id, "creator-1");
        assert_eq!(lobby.max_players, 10);
        assert!(!lobby.race_started);
        assert!(lobby.players.is_empty());
    }

    #[test]
    fn test_lobby_add_player() {
        let mut lobby = Lobby::new("vendee-2020".to_string(), "creator-1".to_string());
        let player = make_test_player("player-1", "Alice");

        let result = lobby.add_player(player);

        assert!(result.is_ok());
        assert_eq!(lobby.players.len(), 1);
        assert!(lobby.players.contains_key("player-1"));
    }

    #[test]
    fn test_lobby_add_player_updates_activity() {
        let mut lobby = Lobby::new("vendee-2020".to_string(), "creator-1".to_string());
        let initial_activity = lobby.last_activity;

        // Small delay to ensure time difference
        std::thread::sleep(std::time::Duration::from_millis(10));

        let player = make_test_player("player-1", "Alice");
        lobby.add_player(player).unwrap();

        assert!(lobby.last_activity > initial_activity);
    }

    #[test]
    fn test_lobby_add_player_fails_when_race_started() {
        let mut lobby = Lobby::new("vendee-2020".to_string(), "creator-1".to_string());
        lobby.race_started = true;

        let player = make_test_player("player-1", "Alice");
        let result = lobby.add_player(player);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Race has already started");
    }

    #[test]
    fn test_lobby_add_player_fails_when_full() {
        let mut lobby = Lobby::new("vendee-2020".to_string(), "creator-1".to_string());

        // Add max_players
        for i in 0..lobby.max_players {
            let player = make_test_player(&format!("player-{}", i), &format!("Player {}", i));
            lobby.add_player(player).unwrap();
        }

        // Next player should fail
        let extra_player = make_test_player("extra", "Extra");
        let result = lobby.add_player(extra_player);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Lobby is full");
    }

    #[test]
    fn test_lobby_remove_player() {
        let mut lobby = Lobby::new("vendee-2020".to_string(), "creator-1".to_string());
        let player = make_test_player("player-1", "Alice");
        lobby.add_player(player).unwrap();

        let removed = lobby.remove_player("player-1");

        assert!(removed.is_some());
        assert_eq!(removed.unwrap().name, "Alice");
        assert!(lobby.players.is_empty());
    }

    #[test]
    fn test_lobby_remove_nonexistent_player() {
        let mut lobby = Lobby::new("vendee-2020".to_string(), "creator-1".to_string());

        let removed = lobby.remove_player("nonexistent");

        assert!(removed.is_none());
    }

    #[test]
    fn test_lobby_is_expired_empty_and_old() {
        let mut lobby = Lobby::new("vendee-2020".to_string(), "creator-1".to_string());
        // Set last activity to 6 minutes ago
        lobby.last_activity = Utc::now() - chrono::Duration::minutes(6);

        assert!(lobby.is_expired());
    }

    #[test]
    fn test_lobby_is_not_expired_with_players() {
        let mut lobby = Lobby::new("vendee-2020".to_string(), "creator-1".to_string());
        lobby.last_activity = Utc::now() - chrono::Duration::minutes(6);

        // Add a player
        let player = make_test_player("player-1", "Alice");
        lobby.players.insert("player-1".to_string(), player);

        // Should not be expired because it has players
        assert!(!lobby.is_expired());
    }

    #[test]
    fn test_lobby_is_not_expired_recent_activity() {
        let lobby = Lobby::new("vendee-2020".to_string(), "creator-1".to_string());
        // Fresh lobby with no players

        // Should not be expired because activity is recent
        assert!(!lobby.is_expired());
    }

    #[test]
    fn test_lobby_get_player_infos() {
        let mut lobby = Lobby::new("vendee-2020".to_string(), "creator-1".to_string());
        lobby.add_player(make_test_player("p1", "Alice")).unwrap();
        lobby.add_player(make_test_player("p2", "Bob")).unwrap();

        let infos = lobby.get_player_infos();

        assert_eq!(infos.len(), 2);
        let names: Vec<&str> = infos.iter().map(|i| i.name.as_str()).collect();
        assert!(names.contains(&"Alice"));
        assert!(names.contains(&"Bob"));
    }

    // =========================================================================
    // LobbyManager tests (async)
    // =========================================================================

    #[tokio::test]
    async fn test_lobby_manager_create_lobby() {
        let manager = LobbyManager::new();
        let (tx, _rx) = mpsc::unbounded_channel();

        let result = manager
            .create_lobby(
                "vendee-2020".to_string(),
                "player-1".to_string(),
                "Alice".to_string(),
                tx,
            )
            .await;

        assert!(result.is_ok());
        let lobby_id = result.unwrap();
        assert_eq!(lobby_id.len(), 6);

        // Verify lobby exists
        let lobbies = manager.lobbies.read().await;
        assert!(lobbies.contains_key(&lobby_id));
    }

    #[tokio::test]
    async fn test_lobby_manager_join_lobby() {
        let manager = LobbyManager::new();
        let (tx1, _rx1) = mpsc::unbounded_channel();
        let (tx2, _rx2) = mpsc::unbounded_channel();

        // Create lobby
        let lobby_id = manager
            .create_lobby(
                "vendee-2020".to_string(),
                "player-1".to_string(),
                "Alice".to_string(),
                tx1,
            )
            .await
            .unwrap();

        // Join lobby
        let result = manager
            .join_lobby(&lobby_id, "player-2".to_string(), "Bob".to_string(), tx2)
            .await;

        assert!(result.is_ok());
        let (players, course_key, is_creator) = result.unwrap();
        assert_eq!(course_key, "vendee-2020");
        assert!(!is_creator);
        assert_eq!(players.len(), 2); // Alice and Bob
    }

    #[tokio::test]
    async fn test_lobby_manager_join_nonexistent_lobby() {
        let manager = LobbyManager::new();
        let (tx, _rx) = mpsc::unbounded_channel();

        let result = manager
            .join_lobby("AAAAAA", "player-1".to_string(), "Alice".to_string(), tx)
            .await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Lobby not found");
    }

    #[tokio::test]
    async fn test_lobby_manager_leave_lobby() {
        let manager = LobbyManager::new();
        let (tx, _rx) = mpsc::unbounded_channel();

        let lobby_id = manager
            .create_lobby(
                "vendee-2020".to_string(),
                "player-1".to_string(),
                "Alice".to_string(),
                tx,
            )
            .await
            .unwrap();

        // Leave lobby
        manager.leave_lobby("player-1").await;

        // Verify lobby is removed (empty lobby gets cleaned up)
        let lobbies = manager.lobbies.read().await;
        assert!(!lobbies.contains_key(&lobby_id));
    }

    #[tokio::test]
    async fn test_lobby_manager_list_lobbies() {
        let manager = LobbyManager::new();
        let (tx1, _rx1) = mpsc::unbounded_channel();
        let (tx2, _rx2) = mpsc::unbounded_channel();

        manager
            .create_lobby(
                "vendee-2020".to_string(),
                "player-1".to_string(),
                "Alice".to_string(),
                tx1,
            )
            .await
            .unwrap();

        manager
            .create_lobby(
                "vendee-2020".to_string(),
                "player-2".to_string(),
                "Bob".to_string(),
                tx2,
            )
            .await
            .unwrap();

        let lobbies = manager.list_lobbies().await;

        assert_eq!(lobbies.len(), 2);
    }

    #[tokio::test]
    async fn test_lobby_manager_list_lobbies_excludes_started() {
        let manager = LobbyManager::new();
        let (tx, _rx) = mpsc::unbounded_channel();

        let lobby_id = manager
            .create_lobby(
                "vendee-2020".to_string(),
                "player-1".to_string(),
                "Alice".to_string(),
                tx,
            )
            .await
            .unwrap();

        // Mark race as started
        {
            let mut lobbies = manager.lobbies.write().await;
            lobbies.get_mut(&lobby_id).unwrap().race_started = true;
        }

        let lobbies = manager.list_lobbies().await;

        assert!(lobbies.is_empty());
    }
}

// ============================================================================
// WebSocket Handler
// ============================================================================

pub async fn handle_websocket(ws: WebSocket, manager: LobbyManager) {
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
    manager.leave_lobby(&player_id).await;
    forward_task.abort();
}

async fn handle_client_message(
    manager: &LobbyManager,
    player_id: &str,
    tx: mpsc::UnboundedSender<ServerMessage>,
    message: ClientMessage,
) {
    let result: Result<(), String> = match message {
        ClientMessage::CreateLobby {
            course_key,
            player_name,
        } => {
            match manager
                .create_lobby(course_key, player_id.to_string(), player_name, tx.clone())
                .await
            {
                Ok(lobby_id) => {
                    let _ = tx.send(ServerMessage::LobbyCreated {
                        lobby_id,
                        player_id: player_id.to_string(),
                    });
                    Ok(())
                }
                Err(e) => Err(e),
            }
        }

        ClientMessage::JoinLobby {
            lobby_id,
            player_name,
        } => {
            match manager
                .join_lobby(&lobby_id, player_id.to_string(), player_name, tx.clone())
                .await
            {
                Ok((players, course_key, is_creator)) => {
                    let _ = tx.send(ServerMessage::LobbyJoined {
                        lobby_id,
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

        ClientMessage::LeaveLobby => {
            manager.leave_lobby(player_id).await;
            Ok(())
        }

        ClientMessage::Offer {
            target_player_id,
            sdp,
        } => {
            manager
                .forward_to_player(
                    player_id,
                    &target_player_id,
                    ServerMessage::Offer {
                        from_player_id: player_id.to_string(),
                        sdp,
                    },
                )
                .await
        }

        ClientMessage::Answer {
            target_player_id,
            sdp,
        } => {
            manager
                .forward_to_player(
                    player_id,
                    &target_player_id,
                    ServerMessage::Answer {
                        from_player_id: player_id.to_string(),
                        sdp,
                    },
                )
                .await
        }

        ClientMessage::IceCandidate {
            target_player_id,
            candidate,
        } => {
            manager
                .forward_to_player(
                    player_id,
                    &target_player_id,
                    ServerMessage::IceCandidate {
                        from_player_id: player_id.to_string(),
                        candidate,
                    },
                )
                .await
        }

        ClientMessage::StartRace => manager.start_race(player_id).await,
    };

    if let Err(error_message) = result {
        let _ = tx.send(ServerMessage::Error {
            message: error_message,
        });
    }
}

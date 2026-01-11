use chrono::{DateTime, Utc};
use futures::{SinkExt, StreamExt};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use warp::ws::{Message, WebSocket};

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
                if ws_tx.send(Message::text(json)).await.is_err() {
                    break;
                }
            }
        }
    });

    // Process incoming messages
    while let Some(result) = ws_rx.next().await {
        match result {
            Ok(msg) => {
                if msg.is_text() {
                    if let Ok(text) = msg.to_str() {
                        if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(text) {
                            handle_client_message(&manager, &player_id, tx.clone(), client_msg)
                                .await;
                        }
                    }
                } else if msg.is_close() {
                    break;
                }
            }
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

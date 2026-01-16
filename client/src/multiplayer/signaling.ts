import { ClientMessage, ServerMessage, MultiplayerCallbacks } from "./types";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

/**
 * WebSocket client for multiplayer server communication.
 * Handles lobby management and position updates.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private callbacks: MultiplayerCallbacks;

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = serverUrl.replace(/^http/, "ws") + "/multiplayer/lobby";
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        resolve();
      };

      this.ws.onerror = () => {
        reject(new Error("WebSocket connection failed"));
      };

      this.ws.onclose = () => {
        this.callbacks.onDisconnect();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          this.handleMessage(message);
        } catch (e) {
          console.error("Failed to parse signaling message:", e);
        }
      };
    });
  }

  private handleMessage(message: ServerMessage) {
    switch (message.type) {
      case "Error":
        this.callbacks.onError(message.message);
        break;

      case "LobbyCreated":
        this.callbacks.onLobbyCreated(message.lobby_id, message.player_id);
        break;

      case "LobbyJoined":
        this.callbacks.onLobbyJoined(
          message.lobby_id,
          message.player_id,
          message.players,
          message.is_creator,
          message.course_key,
        );
        break;

      case "PlayerJoined":
        this.callbacks.onPlayerJoined(message.player_id, message.player_name);
        break;

      case "PlayerLeft":
        this.callbacks.onPlayerLeft(message.player_id);
        break;

      case "RaceCountdown":
        this.callbacks.onCountdown(message.seconds);
        break;

      case "RaceStarted":
        this.callbacks.onRaceStarted();
        break;

      case "RaceEnded":
        this.callbacks.onRaceEnded(message.reason);
        break;

      case "PositionUpdate":
        this.callbacks.onPeerPositionUpdate(
          message.player_id,
          { lng: message.lng, lat: message.lat },
          message.heading,
          "", // Name is resolved by the client from peerStates
          message.race_time,
        );
        break;
    }
  }

  send(message: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  createLobby(courseKey: string, playerName: string) {
    this.send({
      type: "CreateLobby",
      course_key: courseKey,
      player_name: playerName,
    });
  }

  joinLobby(lobbyId: string, playerName: string) {
    this.send({
      type: "JoinLobby",
      lobby_id: lobbyId,
      player_name: playerName,
    });
  }

  leaveLobby() {
    this.send({ type: "LeaveLobby" });
  }

  startRace() {
    this.send({ type: "StartRace" });
  }

  sendPositionUpdate(lng: number, lat: number, heading: number) {
    this.send({
      type: "PositionUpdate",
      lng,
      lat,
      heading,
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

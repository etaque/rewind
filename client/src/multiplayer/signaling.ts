import { ClientMessage, ServerMessage, MultiplayerCallbacks } from "./types";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

/**
 * WebSocket client for signaling server communication.
 * Handles lobby management and WebRTC signaling message forwarding.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private callbacks: MultiplayerCallbacks;
  private onWebRTCMessage: (message: ServerMessage) => void;

  constructor(
    callbacks: MultiplayerCallbacks,
    onWebRTCMessage: (message: ServerMessage) => void,
  ) {
    this.callbacks = callbacks;
    this.onWebRTCMessage = onWebRTCMessage;
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
        );
        break;

      case "PlayerJoined":
        this.callbacks.onPlayerJoined(message.player_id, message.player_name);
        break;

      case "PlayerLeft":
        this.callbacks.onPlayerLeft(message.player_id);
        break;

      case "Offer":
      case "Answer":
      case "IceCandidate":
        this.onWebRTCMessage(message);
        break;

      case "RaceCountdown":
        this.callbacks.onCountdown(message.seconds);
        break;

      case "RaceStarted":
        this.callbacks.onRaceStarted(message.start_time, message.course_key);
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

  sendOffer(targetPlayerId: string, sdp: string) {
    this.send({
      type: "Offer",
      target_player_id: targetPlayerId,
      sdp,
    });
  }

  sendAnswer(targetPlayerId: string, sdp: string) {
    this.send({
      type: "Answer",
      target_player_id: targetPlayerId,
      sdp,
    });
  }

  sendIceCandidate(targetPlayerId: string, candidate: string) {
    this.send({
      type: "IceCandidate",
      target_player_id: targetPlayerId,
      candidate,
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

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
      const wsUrl = serverUrl.replace(/^http/, "ws") + "/multiplayer/race";
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

      case "RaceCreated":
        this.callbacks.onRaceCreated(
          message.raceId,
          message.playerId,
          message.windRasterSources,
        );
        break;

      case "RaceJoined":
        this.callbacks.onRaceJoined(
          message.raceId,
          message.playerId,
          message.players,
          message.isCreator,
          message.courseKey,
          message.windRasterSources,
        );
        break;

      case "PlayerJoined":
        this.callbacks.onPlayerJoined(message.playerId, message.playerName);
        break;

      case "PlayerLeft":
        this.callbacks.onPlayerLeft(message.playerId);
        break;

      case "RaceCountdown":
        this.callbacks.onCountdown(message.seconds);
        break;

      case "RaceEnded":
        this.callbacks.onRaceEnded(message.reason);
        break;

      case "PositionUpdate":
        this.callbacks.onPeerPositionUpdate(
          message.playerId,
          { lng: message.lng, lat: message.lat },
          message.heading,
          "", // Name is resolved by the client from peerStates
          message.raceTime,
        );
        break;

      case "Leaderboard":
        this.callbacks.onLeaderboardUpdate(message.entries);
        break;
    }
  }

  send(message: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  createRace(courseKey: string, playerName: string) {
    this.send({
      type: "CreateRace",
      courseKey: courseKey,
      playerName: playerName,
    });
  }

  joinRace(raceId: string, playerName: string) {
    this.send({
      type: "JoinRace",
      raceId: raceId,
      playerName: playerName,
    });
  }

  leaveRace() {
    this.send({ type: "LeaveRace" });
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

  sendGateCrossed(gateIndex: number, courseTime: number) {
    this.send({
      type: "GateCrossed",
      gateIndex,
      courseTime,
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

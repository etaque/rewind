import { ClientMessage, ServerMessage, MultiplayerCallbacks } from "./types";

const SERVER_MESSAGE_TYPES = new Set([
  "Error",
  "RaceCreated",
  "RaceJoined",
  "PlayerJoined",
  "PlayerLeft",
  "RaceCountdown",
  "RaceStarted",
  "PositionUpdate",
  "RaceEnded",
  "Leaderboard",
  "SyncRaceTime",
]);

function isServerMessage(value: unknown): value is ServerMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string" &&
    SERVER_MESSAGE_TYPES.has((value as { type: string }).type)
  );
}

function getServerUrl(): string {
  const url = import.meta.env.REWIND_SERVER_URL;
  if (typeof url !== "string" || url === "") {
    throw new Error(
      "REWIND_SERVER_URL environment variable is not set. " +
        "Add it to your .env file or set it in your environment.",
    );
  }
  return url;
}

const serverUrl = getServerUrl();

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
          const parsed: unknown = JSON.parse(event.data);
          if (!isServerMessage(parsed)) {
            console.error("Invalid server message:", parsed);
            return;
          }
          this.handleMessage(parsed);
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

      case "SyncRaceTime":
        this.callbacks.onSyncRaceTime(message.raceTime);
        break;
    }
  }

  send(message: ClientMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    console.warn("WebSocket send dropped (not connected):", message.type);
    return false;
  }

  createRace(courseKey: string, playerName: string, persistentId: string) {
    this.send({
      type: "CreateRace",
      courseKey: courseKey,
      playerName: playerName,
      persistentId: persistentId,
    });
  }

  joinRace(raceId: string, playerName: string, persistentId: string) {
    this.send({
      type: "JoinRace",
      raceId: raceId,
      playerName: playerName,
      persistentId: persistentId,
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

import { LngLat, WindRasterSource } from "../models";

// ============================================================================
// Signaling Messages (match server/src/multiplayer.rs)
// ============================================================================

export type ClientMessage =
  | { type: "CreateRace"; courseKey: string; playerName: string }
  | { type: "JoinRace"; raceId: string; playerName: string }
  | { type: "LeaveRace" }
  | { type: "StartRace" }
  | { type: "PositionUpdate"; lng: number; lat: number; heading: number }
  | { type: "GateCrossed"; gateIndex: number; courseTime: number };

export type LeaderboardEntry = {
  playerId: string;
  playerName: string;
  nextGateIndex: number;
  distanceToNextGate: number;
  finishTime: number | null;
};

export type ServerMessage =
  | { type: "Error"; message: string }
  | {
      type: "RaceCreated";
      raceId: string;
      playerId: string;
      windRasterSources: WindRasterSource[];
    }
  | {
      type: "RaceJoined";
      raceId: string;
      playerId: string;
      courseKey: string;
      players: PlayerInfo[];
      windRasterSources: WindRasterSource[];
      isCreator: boolean;
    }
  | { type: "PlayerJoined"; playerId: string; playerName: string }
  | { type: "PlayerLeft"; playerId: string }
  | { type: "RaceCountdown"; seconds: number }
  | { type: "RaceStarted"; startTime: number; courseKey: string }
  | {
      type: "PositionUpdate";
      playerId: string;
      lng: number;
      lat: number;
      heading: number;
      raceTime: number;
    }
  | { type: "RaceEnded"; reason: string }
  | { type: "Leaderboard"; entries: LeaderboardEntry[] };

// ============================================================================
// State Types
// ============================================================================

export type PlayerInfo = {
  id: string;
  name: string;
};

export type PeerState = {
  id: string;
  name: string;
  position: LngLat | null;
  heading: number | null;
  lastUpdate: number;
};

export type RaceState = {
  id: string;
  courseKey: string;
  myPlayerId: string;
  isCreator: boolean;
  players: Map<string, PeerState>;
  countdown: number | null;
  raceStartTime: number | null;
};

export type MultiplayerCallbacks = {
  onRaceCreated: (
    raceId: string,
    playerId: string,
    windRasterSources: WindRasterSource[],
  ) => void;
  onRaceJoined: (
    raceId: string,
    playerId: string,
    players: PlayerInfo[],
    isCreator: boolean,
    courseKey: string,
    windRasterSources: WindRasterSource[],
  ) => void;
  onPlayerJoined: (playerId: string, playerName: string) => void;
  onPlayerLeft: (playerId: string) => void;
  onPeerPositionUpdate: (
    peerId: string,
    position: LngLat,
    heading: number,
    name: string,
    raceTime: number,
  ) => void;
  onCountdown: (seconds: number) => void;
  onRaceEnded: (reason: string) => void;
  onLeaderboardUpdate: (entries: LeaderboardEntry[]) => void;
  onError: (message: string) => void;
  onDisconnect: () => void;
};

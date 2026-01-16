import { LngLat } from "../models";

// ============================================================================
// Signaling Messages (match server/src/multiplayer.rs)
// ============================================================================

export type ClientMessage =
  | { type: "CreateRace"; course_key: string; player_name: string }
  | { type: "JoinRace"; race_id: string; player_name: string }
  | { type: "LeaveRace" }
  | { type: "StartRace" }
  | { type: "PositionUpdate"; lng: number; lat: number; heading: number };

export type ServerMessage =
  | { type: "Error"; message: string }
  | { type: "RaceCreated"; race_id: string; player_id: string }
  | {
      type: "RaceJoined";
      race_id: string;
      player_id: string;
      course_key: string;
      players: PlayerInfo[];
      is_creator: boolean;
    }
  | { type: "PlayerJoined"; player_id: string; player_name: string }
  | { type: "PlayerLeft"; player_id: string }
  | { type: "RaceCountdown"; seconds: number }
  | { type: "RaceStarted"; start_time: number; course_key: string }
  | {
      type: "PositionUpdate";
      player_id: string;
      lng: number;
      lat: number;
      heading: number;
      race_time: number;
    }
  | { type: "RaceEnded"; reason: string };

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
  onRaceCreated: (raceId: string, playerId: string) => void;
  onRaceJoined: (
    raceId: string,
    playerId: string,
    players: PlayerInfo[],
    isCreator: boolean,
    courseKey: string,
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
  onRaceStarted: () => void;
  onRaceEnded: (reason: string) => void;
  onError: (message: string) => void;
  onDisconnect: () => void;
};

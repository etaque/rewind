import { Course, LngLat, WindSpeed, WindRasterSource } from "../models";
import { LeaderboardEntry, PeerState } from "../multiplayer/types";
import { tick } from "./tick";
import { calculateTackTarget } from "./tack";
import { toggleTWALock } from "./twa-lock";
import { calculateVMGLockHeading } from "./vmg-lock";
import { currentWindContext } from "./wind-context";

export type AppState =
  | { tag: "Idle" }
  | {
      tag: "Loading";
      course: Course;
      race: RaceState;
      windRasterSources: WindRasterSource[];
    }
  | {
      tag: "Countdown";
      countdown: number;
      course: Course;
      windRasterSources: WindRasterSource[];
      race: RaceState;
    }
  | {
      tag: "Playing";
      session: Session;
      race: RaceState;
      raceEndedReason: string | null;
      leaderboard: LeaderboardEntry[];
    };

export type RaceState = {
  id: string;
  myPlayerId: string;
  isCreator: boolean;
  players: Map<string, PeerState>;
};

export type Session = {
  clock: number;
  lastWindRefresh: number;
  courseTime: number;
  serverRaceTime: number;
  position: LngLat;
  turning: Turn;
  heading: number;
  targetHeading: number | null; // for progressive tacking
  lockedTWA: number | null; // when set, maintain this TWA as wind changes
  boatSpeed: number; // in knots
  course: Course;
  currentSource: WindRasterSource | null;
  nextSources: WindRasterSource[];
  windSpeed: WindSpeed;
  finishTime: number | null; // null = racing, number = finished at race time
};

export type AppAction =
  | { type: "LOCAL_WIND_UPDATED"; windSpeed: WindSpeed }
  | { type: "TICK"; delta: number }
  | { type: "TURN"; direction: Turn }
  | { type: "TACK" }
  | { type: "TOGGLE_TWA_LOCK" }
  | { type: "VMG_LOCK" }
  // Multiplayer actions
  | {
      type: "RACE_CREATED";
      raceId: string;
      playerId: string;
      course: Course;
      windRasterSources: WindRasterSource[];
    }
  | {
      type: "RACE_JOINED";
      raceId: string;
      playerId: string;
      course: Course;
      isCreator: boolean;
      players: Map<string, PeerState>;
      windRasterSources: WindRasterSource[];
    }
  | { type: "PLAYER_JOINED"; playerId: string; playerName: string }
  | { type: "PLAYER_LEFT"; playerId: string }
  | { type: "COUNTDOWN"; seconds: number }
  | { type: "START_PLAYING" }
  | { type: "LEAVE_RACE" }
  | { type: "SYNC_RACE_TIME"; raceTime: number }
  | { type: "RACE_ENDED"; reason: string }
  | { type: "LEADERBOARD_UPDATE"; entries: LeaderboardEntry[] };

export type Turn = "left" | "right" | null;

export const initialState: AppState = { tag: "Idle" };

// Helper to create a Playing state from Loading state with raster sources
function createPlayingState(
  state: Extract<AppState, { tag: "Countdown" }>,
  windRasterSources: WindRasterSource[],
): AppState {
  const [currentSource, nextSources] = currentWindContext(
    state.course.startTime,
    null,
    windRasterSources,
  );
  return {
    tag: "Playing",
    race: state.race,
    raceEndedReason: null,
    leaderboard: [],
    session: {
      clock: 0,
      lastWindRefresh: 0,
      courseTime: state.course.startTime,
      serverRaceTime: state.course.startTime,
      position: state.course.start,
      turning: null,
      heading: state.course.startHeading,
      targetHeading: null,
      lockedTWA: null,
      boatSpeed: 0,
      course: state.course,
      currentSource: currentSource,
      nextSources: nextSources,
      windSpeed: { u: 0, v: 0 },
      finishTime: null,
    },
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "LOCAL_WIND_UPDATED":
      if (state.tag !== "Playing") return state;
      return {
        ...state,
        session: { ...state.session, windSpeed: action.windSpeed },
      };

    case "TICK":
      if (state.tag !== "Playing") return state;
      const tickResult = tick(state.session, action.delta);
      return {
        ...state,
        session: {
          ...state.session,
          ...tickResult,
        },
      };

    case "TURN":
      if (state.tag !== "Playing") return state;
      return {
        ...state,
        session: {
          ...state.session,
          turning: action.direction,
          targetHeading: null, // cancel any ongoing tack
          lockedTWA: null, // cancel TWA lock
        },
      };

    case "TACK":
      if (state.tag !== "Playing") return state;
      const targetHeading = calculateTackTarget(state.session);
      if (targetHeading === null) return state;
      return {
        ...state,
        session: {
          ...state.session,
          targetHeading,
        },
      };

    case "TOGGLE_TWA_LOCK":
      if (state.tag !== "Playing") return state;
      return {
        ...state,
        session: {
          ...state.session,
          lockedTWA: toggleTWALock(state.session),
        },
      };

    case "VMG_LOCK": {
      if (state.tag !== "Playing") return state;
      const vmgHeading = calculateVMGLockHeading(state.session);
      if (vmgHeading === null) return state;
      return {
        ...state,
        session: {
          ...state.session,
          targetHeading: vmgHeading,
          lockedTWA: null, // Cancel any TWA lock
        },
      };
    }

    // Multiplayer actions
    case "RACE_CREATED": {
      if (state.tag !== "Idle") return state;
      return {
        tag: "Loading",
        course: action.course,
        windRasterSources: action.windRasterSources,
        race: {
          id: action.raceId,
          myPlayerId: action.playerId,
          isCreator: true,
          players: new Map(),
        },
      };
    }

    case "RACE_JOINED": {
      // Allow joining from Idle or Loading (switching races)
      if (state.tag !== "Idle" && state.tag !== "Loading") return state;
      return {
        tag: "Loading",
        course: action.course,
        windRasterSources: action.windRasterSources,
        race: {
          id: action.raceId,
          myPlayerId: action.playerId,
          isCreator: action.isCreator,
          players: action.players,
        },
      };
    }

    case "PLAYER_JOINED":
      if (state.tag !== "Loading") return state;
      const newPlayers = new Map(state.race.players);
      newPlayers.set(action.playerId, {
        id: action.playerId,
        name: action.playerName,
        position: null,
        heading: null,
        lastUpdate: 0,
      });
      return {
        ...state,
        race: { ...state.race, players: newPlayers },
      };

    case "PLAYER_LEFT":
      if (state.tag !== "Loading") return state;
      const remainingPlayers = new Map(state.race.players);
      remainingPlayers.delete(action.playerId);
      return {
        ...state,
        race: { ...state.race, players: remainingPlayers },
      };

    case "COUNTDOWN":
      if (state.tag !== "Loading" && state.tag !== "Countdown") return state;
      if (state.windRasterSources === null) return state;
      if (state.tag === "Countdown" && action.seconds === 0) {
        return createPlayingState(state, state.windRasterSources);
      }
      return {
        ...state,
        tag: "Countdown",
        countdown: action.seconds,
        windRasterSources: state.windRasterSources,
      };

    case "START_PLAYING":
      if (state.tag !== "Countdown") return state;
      return createPlayingState(state, state.windRasterSources);

    case "LEAVE_RACE":
      if (state.tag !== "Loading") return state;
      return { tag: "Idle" };

    case "SYNC_RACE_TIME": {
      if (state.tag !== "Playing") return state;
      return {
        ...state,
        session: {
          ...state.session,
          serverRaceTime: action.raceTime,
        },
      };
    }

    case "RACE_ENDED":
      if (state.tag !== "Playing") return state;
      return {
        ...state,
        raceEndedReason: action.reason,
      };

    case "LEADERBOARD_UPDATE": {
      if (state.tag !== "Playing") return state;
      const myEntry = action.entries.find(
        (e) => e.playerId === state.race.myPlayerId,
      );
      return {
        ...state,
        leaderboard: action.entries,
        session: {
          ...state.session,
          finishTime: myEntry?.finishTime ?? state.session.finishTime,
        },
      };
    }

    default:
      return state;
  }
}

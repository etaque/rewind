import { produce, enableMapSet } from "immer";
import { Course, LngLat, WindSpeed, WindRasterSource } from "../models";
import { LeaderboardEntry, PeerState } from "../multiplayer/types";
import { tick } from "./tick";
import { calculateTackTarget } from "./tack";
import { toggleTWALock } from "./twa-lock";
import { calculateVMGLockHeading } from "./vmg-lock";
import { currentWindContext } from "./wind-context";
import { PolarData } from "./polar";

// Enable Map support in Immer
enableMapSet();

export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

export const asyncState = {
  idle: <T>(): AsyncState<T> => ({ status: "idle" }),
  loading: <T>(): AsyncState<T> => ({ status: "loading" }),
  success: <T>(data: T): AsyncState<T> => ({ status: "success", data }),
  error: <T>(error: string): AsyncState<T> => ({ status: "error", error }),
};

export type AppState =
  | { tag: "Idle" }
  | {
      tag: "Lobby";
      course: Course;
      race: RaceState;
      windRasterSources: WindRasterSource[];
      wind: AsyncState<void>;
      polar: PolarData | null;
    }
  | {
      tag: "Countdown";
      countdown: number;
      course: Course;
      windRasterSources: WindRasterSource[];
      polar: PolarData;
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
  turningDuration: number; // seconds the turn key has been held
  heading: number;
  targetHeading: number | null; // for progressive tacking
  lockedTWA: number | null; // when set, maintain this TWA as wind changes
  boatSpeed: number; // in knots
  course: Course;
  polar: PolarData;
  currentSource: WindRasterSource | null;
  nextSources: WindRasterSource[];
  windSpeed: WindSpeed;
  nextGateIndex: number; // 0..gates.length for intermediate gates, gates.length for finish
  gateTimes: number[]; // course time when each gate was crossed
  finishTime: number | null; // null = racing, number = finished at race time
};

export type AppAction =
  | { type: "LOCAL_WIND_UPDATED"; windSpeed: WindSpeed }
  | { type: "TICK"; delta: number }
  | { type: "TURN"; direction: Turn }
  | { type: "TACK" }
  | { type: "TOGGLE_TWA_LOCK" }
  | { type: "VMG_LOCK"; mode: "upwind" | "downwind" | "closest" }
  | { type: "GATE_CROSSED"; gateIndex: number; courseTime: number }
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
  | { type: "WIND_LOAD_RESULT"; result: AsyncState<void> }
  | { type: "POLAR_LOADED"; polar: PolarData }
  | { type: "LEAVE_RACE" }
  | { type: "SYNC_RACE_TIME"; raceTime: number }
  | { type: "RACE_ENDED"; reason: string }
  | { type: "LEADERBOARD_UPDATE"; entries: LeaderboardEntry[] };

export type Turn = "left" | "right" | null;

export const initialState: AppState = { tag: "Idle" };

// Helper to create a Playing state from Countdown state
function createPlayingState(
  state: Extract<AppState, { tag: "Countdown" }>,
  windRasterSources: WindRasterSource[],
): Extract<AppState, { tag: "Playing" }> {
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
      turningDuration: 0,
      heading: state.course.startHeading,
      targetHeading: null,
      lockedTWA: null,
      boatSpeed: 0,
      course: state.course,
      polar: state.polar,
      currentSource,
      nextSources,
      windSpeed: { u: 0, v: 0 },
      nextGateIndex: 0,
      gateTimes: [],
      finishTime: null,
    },
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "LOCAL_WIND_UPDATED":
      if (state.tag !== "Playing") return state;
      return produce(state, (draft) => {
        draft.session.windSpeed = action.windSpeed;
      });

    case "TICK":
      if (state.tag !== "Playing") return state;
      return produce(state, (draft) => {
        const tickResult = tick(state.session, action.delta);
        // Apply tick result (excluding gateCrossed which we handle separately)
        const { gateCrossed, ...sessionUpdates } = tickResult;
        Object.assign(draft.session, sessionUpdates);

        // Handle gate crossing
        if (gateCrossed !== null) {
          const numGates = draft.session.course.gates.length;
          draft.session.gateTimes.push(tickResult.courseTime);
          draft.session.nextGateIndex = gateCrossed + 1;
          // If crossed finish line, set finish time
          if (gateCrossed === numGates) {
            draft.session.finishTime = tickResult.courseTime;
          }
        }
      });

    case "TURN":
      if (state.tag !== "Playing") return state;
      return produce(state, (draft) => {
        draft.session.turning = action.direction;
        if (action.direction === null || action.direction !== state.session.turning) {
          draft.session.turningDuration = 0;
        }
        draft.session.targetHeading = null;
        draft.session.lockedTWA = null;
      });

    case "TACK": {
      if (state.tag !== "Playing") return state;
      const targetHeading = calculateTackTarget(state.session);
      if (targetHeading === null) return state;
      return produce(state, (draft) => {
        draft.session.targetHeading = targetHeading;
      });
    }

    case "TOGGLE_TWA_LOCK":
      if (state.tag !== "Playing") return state;
      return produce(state, (draft) => {
        draft.session.lockedTWA = toggleTWALock(state.session);
      });

    case "VMG_LOCK": {
      if (state.tag !== "Playing") return state;
      const vmgHeading = calculateVMGLockHeading(state.session, action.mode);
      if (vmgHeading === null) return state;
      return produce(state, (draft) => {
        draft.session.targetHeading = vmgHeading;
        draft.session.lockedTWA = null;
      });
    }

    case "GATE_CROSSED": {
      if (state.tag !== "Playing") return state;
      // Validate this is the expected next gate
      if (action.gateIndex !== state.session.nextGateIndex) return state;
      const numGates = state.session.course.gates.length;
      return produce(state, (draft) => {
        draft.session.gateTimes.push(action.courseTime);
        draft.session.nextGateIndex = action.gateIndex + 1;
        // If crossed finish line (gate index === numGates), set finish time
        if (action.gateIndex === numGates) {
          draft.session.finishTime = action.courseTime;
        }
      });
    }

    case "RACE_CREATED":
      if (state.tag !== "Idle") return state;
      return {
        tag: "Lobby",
        course: action.course,
        windRasterSources: action.windRasterSources,
        wind: asyncState.loading(),
        polar: null,
        race: {
          id: action.raceId,
          myPlayerId: action.playerId,
          isCreator: true,
          players: new Map(),
        },
      };

    case "RACE_JOINED":
      if (state.tag !== "Idle" && state.tag !== "Lobby") return state;
      return {
        tag: "Lobby",
        course: action.course,
        windRasterSources: action.windRasterSources,
        wind: asyncState.loading(),
        polar: null,
        race: {
          id: action.raceId,
          myPlayerId: action.playerId,
          isCreator: action.isCreator,
          players: action.players,
        },
      };

    case "WIND_LOAD_RESULT":
      if (state.tag !== "Lobby") return state;
      return produce(state, (draft) => {
        draft.wind = action.result;
      });

    case "POLAR_LOADED":
      if (state.tag !== "Lobby") return state;
      return produce(state, (draft) => {
        draft.polar = action.polar;
      });

    case "PLAYER_JOINED":
      if (state.tag !== "Lobby") return state;
      return produce(state, (draft) => {
        draft.race.players.set(action.playerId, {
          id: action.playerId,
          name: action.playerName,
          position: null,
          heading: null,
          lastUpdate: 0,
        });
      });

    case "PLAYER_LEFT":
      if (state.tag !== "Lobby") return state;
      return produce(state, (draft) => {
        draft.race.players.delete(action.playerId);
      });

    case "COUNTDOWN":
      if (state.tag !== "Lobby" && state.tag !== "Countdown") return state;
      // Can only start countdown if wind and polar are loaded
      if (
        state.tag === "Lobby" &&
        (state.wind.status !== "success" || state.polar === null)
      )
        return state;
      if (state.tag === "Countdown" && action.seconds === 0) {
        return createPlayingState(state, state.windRasterSources);
      }
      // Transition from Lobby to Countdown
      if (state.tag === "Lobby") {
        return {
          tag: "Countdown",
          countdown: action.seconds,
          course: state.course,
          windRasterSources: state.windRasterSources,
          polar: state.polar!, // We know polar is not null from the check above
          race: state.race,
        };
      }
      return produce(state, (draft) => {
        (draft as Extract<AppState, { tag: "Countdown" }>).countdown =
          action.seconds;
      });

    case "START_PLAYING":
      if (state.tag !== "Countdown") return state;
      return createPlayingState(state, state.windRasterSources);

    case "LEAVE_RACE":
      if (state.tag === "Idle") return state;
      return { tag: "Idle" };

    case "SYNC_RACE_TIME":
      if (state.tag !== "Playing") return state;
      return produce(state, (draft) => {
        draft.session.serverRaceTime = action.raceTime;
      });

    case "RACE_ENDED":
      if (state.tag !== "Playing") return state;
      return produce(state, (draft) => {
        draft.raceEndedReason = action.reason;
      });

    case "LEADERBOARD_UPDATE": {
      if (state.tag !== "Playing") return state;
      const myEntry = action.entries.find(
        (e) => e.playerId === state.race.myPlayerId,
      );
      return produce(state, (draft) => {
        draft.leaderboard = action.entries;
        if (myEntry?.finishTime !== undefined) {
          draft.session.finishTime = myEntry.finishTime;
        }
      });
    }

    default:
      return state;
  }
}

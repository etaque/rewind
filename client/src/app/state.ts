import { Course, LngLat, WindSpeed, WindReport } from "../models";
import { PeerState } from "../multiplayer/types";
import { tick } from "./tick";
import { calculateTackTarget } from "./tack";
import { toggleTWALock } from "./twa-lock";
import { refreshWindReport } from "./wind-report";
import { vg20 } from "./courses";

const coursesByKey: Record<string, Course> = {
  vg20,
};

export type AppState =
  | { tag: "Idle" }
  | {
      tag: "Loading";
      course: Course;
      lobby: LobbyState;
      reportsLoaded: boolean;
    }
  | { tag: "Playing"; session: Session; lobby: LobbyState };

export type LobbyState = {
  id: string;
  courseKey: string;
  myPlayerId: string;
  isCreator: boolean;
  players: Map<string, PeerState>;
  countdown: number | null;
  raceStarted: boolean;
};

export type Session = {
  clock: number;
  lastWindRefresh: number;
  courseTime: number;
  position: LngLat;
  turning: Turn;
  heading: number;
  targetHeading: number | null; // for progressive tacking
  lockedTWA: number | null; // when set, maintain this TWA as wind changes
  boatSpeed: number; // in knots
  course: Course;
  currentReport: WindReport | null;
  nextReports: WindReport[];
  windSpeed: WindSpeed;
};

export type AppAction =
  | { type: "REPORTS_LOADED"; reports: WindReport[] }
  | { type: "REPORTS_ERROR" }
  | { type: "LOCAL_WIND_UPDATED"; windSpeed: WindSpeed }
  | { type: "TICK"; delta: number }
  | { type: "TURN"; direction: Turn }
  | { type: "TACK" }
  | { type: "TOGGLE_TWA_LOCK" }
  // Multiplayer actions
  | {
      type: "LOBBY_CREATED";
      lobbyId: string;
      playerId: string;
      courseKey: string;
    }
  | {
      type: "LOBBY_JOINED";
      lobbyId: string;
      playerId: string;
      courseKey: string;
      isCreator: boolean;
      players: Map<string, PeerState>;
    }
  | { type: "PLAYER_JOINED"; playerId: string; playerName: string }
  | { type: "PLAYER_LEFT"; playerId: string }
  | { type: "COUNTDOWN"; seconds: number }
  | { type: "RACE_STARTED" }
  | { type: "START_PLAYING"; reports: WindReport[] }
  | { type: "LEAVE_LOBBY" };

export type Turn = "left" | "right" | null;

export const initialState: AppState = { tag: "Idle" };

// Helper to create a Playing state from Loading state with reports
function createPlayingState(
  state: Extract<AppState, { tag: "Loading" }>,
  reports: WindReport[],
): AppState {
  const [currentReport, nextReports] = refreshWindReport(
    state.course.startTime,
    null,
    reports,
  );
  return {
    tag: "Playing",
    lobby: state.lobby,
    session: {
      clock: 0,
      lastWindRefresh: 0,
      courseTime: state.course.startTime,
      position: state.course.start,
      turning: null,
      heading: state.course.startHeading,
      targetHeading: null,
      lockedTWA: null,
      boatSpeed: 0,
      course: state.course,
      currentReport,
      nextReports,
      windSpeed: { u: 0, v: 0 },
    },
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "REPORTS_LOADED":
      if (state.tag !== "Loading") return state;
      // If race already started (countdown finished), go to Playing
      if (state.lobby.raceStarted) {
        return createPlayingState(state, action.reports);
      }
      // Otherwise, mark reports as loaded and wait for race start
      return {
        ...state,
        reportsLoaded: true,
      };

    case "REPORTS_ERROR":
      return { tag: "Idle" };

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

    // Multiplayer actions
    case "LOBBY_CREATED": {
      if (state.tag !== "Idle") return state;
      const course = coursesByKey[action.courseKey];
      if (!course) return { tag: "Idle" };
      return {
        tag: "Loading",
        course,
        reportsLoaded: false,
        lobby: {
          id: action.lobbyId,
          courseKey: action.courseKey,
          myPlayerId: action.playerId,
          isCreator: true,
          players: new Map(),
          countdown: null,
          raceStarted: false,
        },
      };
    }

    case "LOBBY_JOINED": {
      // Allow joining from Idle or Loading (switching lobbies)
      if (state.tag !== "Idle" && state.tag !== "Loading") return state;
      const course = coursesByKey[action.courseKey];
      if (!course) return { tag: "Idle" };
      return {
        tag: "Loading",
        course,
        // Keep reportsLoaded if we already have them for the same course
        reportsLoaded:
          state.tag === "Loading" && state.course.key === course.key
            ? state.reportsLoaded
            : false,
        lobby: {
          id: action.lobbyId,
          courseKey: action.courseKey,
          myPlayerId: action.playerId,
          isCreator: action.isCreator,
          players: action.players,
          countdown: null,
          raceStarted: false,
        },
      };
    }

    case "PLAYER_JOINED":
      if (state.tag !== "Loading") return state;
      const newPlayers = new Map(state.lobby.players);
      newPlayers.set(action.playerId, {
        id: action.playerId,
        name: action.playerName,
        position: null,
        heading: null,
        lastUpdate: 0,
      });
      return {
        ...state,
        lobby: { ...state.lobby, players: newPlayers },
      };

    case "PLAYER_LEFT":
      if (state.tag !== "Loading") return state;
      const remainingPlayers = new Map(state.lobby.players);
      remainingPlayers.delete(action.playerId);
      return {
        ...state,
        lobby: { ...state.lobby, players: remainingPlayers },
      };

    case "COUNTDOWN":
      if (state.tag !== "Loading") return state;
      return {
        ...state,
        lobby: { ...state.lobby, countdown: action.seconds },
      };

    case "RACE_STARTED":
      if (state.tag !== "Loading") return state;
      // Mark race as started
      return {
        ...state,
        lobby: { ...state.lobby, raceStarted: true },
      };

    case "START_PLAYING":
      if (state.tag !== "Loading") return state;
      return createPlayingState(state, action.reports);

    case "LEAVE_LOBBY":
      if (state.tag !== "Loading") return state;
      return { tag: "Idle" };

    default:
      return state;
  }
}

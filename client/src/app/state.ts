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
  | { tag: "Multiplayer" }
  | { tag: "InLobby"; lobby: LobbyState }
  | { tag: "Loading"; course: Course; lobby?: LobbyState }
  | { tag: "Ready"; session: Session }
  | { tag: "Playing"; session: Session };

export type LobbyState = {
  id: string;
  courseKey: string;
  myPlayerId: string;
  isCreator: boolean;
  players: Map<string, PeerState>;
  countdown: number | null;
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
  | { type: "LOAD_COURSE"; course: Course }
  | { type: "REPORTS_LOADED"; reports: WindReport[] }
  | { type: "REPORTS_ERROR" }
  | { type: "START_RACE" }
  | { type: "LOCAL_WIND_UPDATED"; windSpeed: WindSpeed }
  | { type: "TICK"; delta: number }
  | { type: "TURN"; direction: Turn }
  | { type: "TACK" }
  | { type: "TOGGLE_TWA_LOCK" }
  // Multiplayer actions
  | { type: "OPEN_MULTIPLAYER" }
  | { type: "CLOSE_MULTIPLAYER" }
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
  | { type: "MULTIPLAYER_RACE_STARTED"; courseKey: string }
  | { type: "LEAVE_LOBBY" };

export type Turn = "left" | "right" | null;

export const initialState: AppState = { tag: "Idle" };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "LOAD_COURSE":
      if (state.tag !== "Idle") return state;
      return { tag: "Loading", course: action.course };

    case "REPORTS_LOADED":
      if (state.tag !== "Loading") return state;
      const [currentReport, nextReports] = refreshWindReport(
        state.course.startTime,
        null,
        action.reports,
      );
      return {
        tag: "Ready",
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

    case "START_RACE":
      if (state.tag !== "Ready") return state;
      return {
        tag: "Playing",
        session: state.session,
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
    case "OPEN_MULTIPLAYER":
      if (state.tag !== "Idle") return state;
      return { tag: "Multiplayer" };

    case "CLOSE_MULTIPLAYER":
      if (state.tag !== "Multiplayer") return state;
      return { tag: "Idle" };

    case "LOBBY_CREATED":
      if (state.tag !== "Multiplayer") return state;
      return {
        tag: "InLobby",
        lobby: {
          id: action.lobbyId,
          courseKey: action.courseKey,
          myPlayerId: action.playerId,
          isCreator: true,
          players: new Map(),
          countdown: null,
        },
      };

    case "LOBBY_JOINED":
      if (state.tag !== "Multiplayer") return state;
      return {
        tag: "InLobby",
        lobby: {
          id: action.lobbyId,
          courseKey: action.courseKey,
          myPlayerId: action.playerId,
          isCreator: action.isCreator,
          players: action.players,
          countdown: null,
        },
      };

    case "PLAYER_JOINED":
      if (state.tag !== "InLobby") return state;
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
      if (state.tag !== "InLobby") return state;
      const remainingPlayers = new Map(state.lobby.players);
      remainingPlayers.delete(action.playerId);
      return {
        ...state,
        lobby: { ...state.lobby, players: remainingPlayers },
      };

    case "COUNTDOWN":
      if (state.tag !== "InLobby") return state;
      return {
        ...state,
        lobby: { ...state.lobby, countdown: action.seconds },
      };

    case "MULTIPLAYER_RACE_STARTED": {
      if (state.tag !== "InLobby") return state;
      const course = coursesByKey[action.courseKey];
      if (!course) return { tag: "Idle" };
      return {
        tag: "Loading",
        course,
        lobby: state.lobby,
      };
    }

    case "LEAVE_LOBBY":
      if (state.tag !== "InLobby") return state;
      return { tag: "Multiplayer" };

    default:
      return state;
  }
}

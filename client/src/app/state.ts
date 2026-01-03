import { Course, LngLat, WindSpeed, WindReport } from "../models";
import { tick } from "./tick";
import { calculateTackTarget } from "./tack";
import { toggleTWALock } from "./twa-lock";

type LoadingWithSession = { tag: "Loading"; course: Course; session?: Session };

export type AppState =
  | { tag: "Idle" }
  | LoadingWithSession
  | { tag: "Ready"; session: Session }
  | { tag: "Playing"; session: Session };

export type Session = {
  clock: number;
  lastWindRefresh: number;
  courseTime: number;
  position: LngLat;
  heading: number;
  targetHeading: number | null; // for progressive tacking
  lockedTWA: number | null; // when set, maintain this TWA as wind changes
  boatSpeed: number; // in knots
  course: Course;
  reports: WindReport[];
  windSpeed: WindSpeed;
};

export type AppAction =
  | { type: "LOAD_COURSE"; course: Course }
  | { type: "REPORTS_LOADED"; reports: WindReport[] }
  | { type: "REPORTS_ERROR" }
  | { type: "WIND_LOADED" }
  | { type: "START_RACE" }
  | { type: "WIND_UPDATED"; windSpeed: WindSpeed }
  | { type: "TICK"; delta: number }
  | { type: "TURN"; delta: number }
  | { type: "TACK" }
  | { type: "TOGGLE_TWA_LOCK" };

export const initialState: AppState = { tag: "Idle" };

export function appReducer(state: AppState, action: AppAction): AppState {
  if (action.type !== "TICK") {
    console.log("Action:", action);
  }
  switch (action.type) {
    case "LOAD_COURSE":
      if (state.tag !== "Idle") return state;
      return { tag: "Loading", course: action.course };

    case "REPORTS_LOADED":
      if (state.tag !== "Loading") return state;
      // Transition to Loading with session data, wait for wind to load
      return {
        tag: "Loading",
        course: state.course,
        session: {
          clock: 0,
          lastWindRefresh: 0,
          courseTime: state.course.startTime,
          position: state.course.start,
          heading: state.course.startHeading,
          targetHeading: null,
          lockedTWA: null,
          boatSpeed: 0,
          course: state.course,
          reports: action.reports,
          windSpeed: { u: 0, v: 0 },
        },
      } as LoadingWithSession;

    case "WIND_LOADED":
      if (state.tag !== "Loading") return state;
      const loadingState = state as LoadingWithSession;
      if (!loadingState.session) return state;
      return {
        tag: "Ready",
        session: loadingState.session,
      };

    case "START_RACE":
      if (state.tag !== "Ready") return state;
      return {
        tag: "Playing",
        session: state.session,
      };

    case "REPORTS_ERROR":
      return { tag: "Idle" };

    case "WIND_UPDATED":
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
          heading: (state.session.heading + action.delta + 360) % 360,
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

    default:
      return state;
  }
}

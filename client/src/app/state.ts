import { Course, LngLat, WindSpeed, WindReport } from "../models";
import { tick } from "./tick";

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
  | { type: "TACK" };

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
        },
      };

    case "TACK":
      if (state.tag !== "Playing") return state;
      // Don't start a new tack if one is already in progress
      if (state.session.targetHeading !== null) return state;

      const { windSpeed, heading } = state.session;
      // Calculate wind direction (where wind comes FROM)
      const windDir =
        (Math.atan2(-windSpeed.u, -windSpeed.v) * 180) / Math.PI + 360;
      const windDirNorm = windDir % 360;

      // Calculate signed TWA (positive = wind from starboard, negative = wind from port)
      let signedTWA = windDirNorm - heading;
      // Normalize to -180 to 180
      while (signedTWA > 180) signedTWA -= 360;
      while (signedTWA < -180) signedTWA += 360;

      // Target heading has the same TWA magnitude but opposite sign
      const targetHeading = (windDirNorm + signedTWA + 360) % 360;

      return {
        ...state,
        session: {
          ...state.session,
          targetHeading,
        },
      };

    default:
      return state;
  }
}

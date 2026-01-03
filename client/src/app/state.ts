import { Course, LngLat, WindSpeed, WindReport } from "../models";
import { tick } from "./tick";
import { calculateTackTarget } from "./tack";
import { toggleTWALock } from "./twa-lock";
import { refreshWindReport } from "./wind-report";

export type AppState =
  | { tag: "Idle" }
  | { tag: "Loading"; course: Course }
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
  | { type: "TURN"; delta: number }
  | { type: "TACK" }
  | { type: "TOGGLE_TWA_LOCK" };

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

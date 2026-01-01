import { Course, LngLat, WindSpeed, WindReport } from "../models";

export type AppState =
  | { tag: "Idle" }
  | { tag: "Loading"; course: Course }
  | { tag: "Playing"; session: Session };

export type Session = {
  clock: number;
  lastWindRefresh: number;
  courseTime: number;
  position: LngLat;
  course: Course;
  reports: WindReport[];
  windSpeed: WindSpeed;
};

export type AppAction =
  | { type: "LOAD_COURSE"; course: Course }
  | { type: "REPORTS_LOADED"; reports: WindReport[] }
  | { type: "REPORTS_ERROR" }
  | { type: "WIND_UPDATED"; windSpeed: WindSpeed }
  | { type: "TICK"; delta: number };

export const initialState: AppState = { tag: "Idle" };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "LOAD_COURSE":
      if (state.tag !== "Idle") return state;
      return { tag: "Loading", course: action.course };

    case "REPORTS_LOADED":
      if (state.tag !== "Loading") return state;
      // Allow playing even with no wind reports (globe will show, no wind animation)
      return {
        tag: "Playing",
        session: {
          clock: 0,
          lastWindRefresh: 0,
          courseTime: state.course.startTime,
          position: state.course.start,
          course: state.course,
          reports: action.reports,
          windSpeed: { u: 0, v: 0 },
        },
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
      const newClock = state.session.clock + action.delta;
      const newCourseTime =
        state.session.course.startTime +
        Math.round(newClock * state.session.course.timeFactor);
      return {
        ...state,
        session: {
          ...state.session,
          clock: newClock,
          courseTime: newCourseTime,
        },
      };

    default:
      return state;
  }
}

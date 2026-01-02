import { Course, LngLat, WindSpeed, WindReport } from "../models";
import { getBoatSpeed, calculateTWA } from "./polar";

export type AppState =
  | { tag: "Idle" }
  | { tag: "Loading"; course: Course }
  | { tag: "Playing"; session: Session };

export type Session = {
  clock: number;
  lastWindRefresh: number;
  courseTime: number;
  position: LngLat;
  heading: number;
  boatSpeed: number; // in knots
  course: Course;
  reports: WindReport[];
  windSpeed: WindSpeed;
};

export type AppAction =
  | { type: "LOAD_COURSE"; course: Course }
  | { type: "REPORTS_LOADED"; reports: WindReport[] }
  | { type: "REPORTS_ERROR" }
  | { type: "WIND_UPDATED"; windSpeed: WindSpeed }
  | { type: "TICK"; delta: number }
  | { type: "TURN"; delta: number };

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
      // Allow playing even with no wind reports (globe will show, no wind animation)
      return {
        tag: "Playing",
        session: {
          clock: 0,
          lastWindRefresh: 0,
          courseTime: state.course.startTime,
          position: state.course.start,
          heading: state.course.startHeading,
          boatSpeed: 0,
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
      const { session } = state;
      const newClock = session.clock + action.delta;
      const newCourseTime =
        session.course.startTime +
        Math.round(newClock * session.course.timeFactor);

      // Calculate wind direction (where wind comes FROM)
      const windDir =
        (Math.atan2(-session.windSpeed.u, -session.windSpeed.v) * 180) /
          Math.PI +
        360;
      const windDirNorm = windDir % 360;

      // Calculate TWS in knots (wind is in m/s, convert to knots)
      const twsMs = Math.sqrt(
        session.windSpeed.u ** 2 + session.windSpeed.v ** 2,
      );
      const tws = twsMs * 1.944;

      // Calculate TWA and boat speed from polar
      const twa = calculateTWA(session.heading, windDirNorm);
      const boatSpeed = getBoatSpeed(tws, twa);

      // Move boat based on speed and heading
      // Boat speed is in knots, delta is in ms
      // 1 knot = 1.852 km/h = 0.0005144 km/s
      // Simulate time is accelerated by timeFactor
      const simDeltaSeconds = (action.delta / 1000) * session.course.timeFactor;
      const distanceKm = boatSpeed * 1.852 * (simDeltaSeconds / 3600);

      // Convert heading to radians (0 = north, clockwise)
      const headingRad = (session.heading * Math.PI) / 180;

      // Calculate position delta
      // 1 degree latitude ≈ 111 km
      // 1 degree longitude ≈ 111 km * cos(latitude)
      const latDelta = (distanceKm * Math.cos(headingRad)) / 111;
      const lngDelta =
        (distanceKm * Math.sin(headingRad)) /
        (111 * Math.cos((session.position.lat * Math.PI) / 180));

      const newPosition: LngLat = {
        lat: session.position.lat + latDelta,
        lng: session.position.lng + lngDelta,
      };

      return {
        ...state,
        session: {
          ...session,
          clock: newClock,
          courseTime: newCourseTime,
          boatSpeed,
          position: newPosition,
        },
      };

    case "TURN":
      if (state.tag !== "Playing") return state;
      return {
        ...state,
        session: {
          ...state.session,
          heading: (state.session.heading + action.delta + 360) % 360,
        },
      };

    default:
      return state;
  }
}

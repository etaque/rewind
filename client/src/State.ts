import { WindReport, LngLat } from "./app/App";

export type State = { type: "Idle" } | { type: "Playing"; session: Session };

export const initialState: State = { type: "Idle" };

export type Session = {
  clock: number;
  courseTime: number;
  position: LngLat;
  course: Course;
  wind?: WindReport;
};

export type Course = {
  key: string;
  name: string;
  startTime: number;
  start: LngLat;
  finish: LngLat;
  timeFactor: number;
};

export const vg20: any = {}; // TODO

function defaultSession(course: Course): Session {
  return {
    clock: 0,
    courseTime: vg20,
    position: course.start,
    course,
  };
}

export type Action =
  | { type: "Start" }
  | { type: "Tick"; delta: number }
  | { type: "Disconnected" };

export type Dispatch = React.Dispatch<
  React.ReducerAction<React.Reducer<State, Action>>
>;

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "Start":
      return { type: "Playing", session: defaultSession(vg20) };
    case "Disconnected":
      return { type: "Idle" };
    case "Tick":
      switch (state.type) {
        case "Playing":
          const session = updateSession(state.session, action.delta);
          return { ...state, session };
        default:
          return state;
      }
  }
}

function updateSession(session: Session, delta: number): Session {
  const clock = session.clock + delta;
  return { ...session, clock };
}

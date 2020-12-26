export type Request =
  | { tag: "ShowMap"; course: Course }
  | {
      tag: "GetWindAt";
      time: number;
      position: LngLat;
    }
  | {
      tag: "MoveTo";
      position: LngLat;
    }
  | {
      tag: "LoadReport";
      windReport: WindReport;
    };

export type Response = {
  tag: "WindIs";
  windForce: WindForce;
};

export type LngLat = {
  lng: number;
  lat: number;
};

export type WindForce = {
  u: number;
  v: number;
};

export type WindReport = {
  id: string;
  time: number;
};

export type Course = {
  key: string;
  name: string;
  startTime: number;
  start: LngLat;
  finish: LngLat;
  timeFactor: number;
};

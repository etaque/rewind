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
  windSpeed: WindSpeed;
};

export type LngLat = {
  lng: number;
  lat: number;
};

export type WindSpeed = {
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

export type Pixel = { x: number; y: number };

/* lambda, phi, gamma */
export type Spherical = [number, number, number];

export type Scene = {
  projection: d3.GeoProjection;
  width: number;
  height: number;
  radius: number;
  center: Pixel;
};

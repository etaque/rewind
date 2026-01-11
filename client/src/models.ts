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
  pngUrl: string;
};

export type Course = {
  key: string;
  name: string;
  startTime: number;
  start: LngLat;
  startHeading: number;
  finish: LngLat;
  timeFactor: number;
};

export type Pixel = { x: number; y: number };

/* lambda, phi, gamma */
export type Spherical = [number, number, number];

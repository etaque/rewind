export type LngLat = {
  lng: number;
  lat: number;
};

export type WindSpeed = {
  u: number;
  v: number;
};

export type WindRasterSource = {
  time: number;
  pngUrl: string;
};

export type Gate = {
  point1: LngLat;
  point2: LngLat;
};

export type ExclusionZone = {
  name: string;
  polygon: LngLat[];
};

export type Course = {
  key: string;
  name: string;
  startTime: number;
  start: LngLat;
  startHeading: number;
  finishLine: Gate;
  gates: Gate[];
  exclusionZones: ExclusionZone[];
  timeFactor: number;
  maxDays: number;
};

export type Pixel = { x: number; y: number };

/* lambda, phi, gamma */
export type Spherical = [number, number, number];

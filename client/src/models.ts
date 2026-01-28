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
  center: LngLat;
  orientation: number; // degrees, 0 = vertical (N-S), 90 = horizontal (E-W)
  lengthNm: number; // length in nautical miles
};

export type ExclusionZone = {
  name: string;
  polygon: LngLat[];
};

export type Course = {
  key: string;
  name: string;
  description: string;
  polar: string;
  startTime: number;
  start: LngLat;
  startHeading: number;
  finishLine: Gate;
  gates: Gate[];
  exclusionZones: ExclusionZone[];
  routeWaypoints: LngLat[][]; // waypoints for each leg
  timeFactor: number;
  maxDays: number;
};

export type Pixel = { x: number; y: number };

/* lambda, phi, gamma */
export type Spherical = [number, number, number];

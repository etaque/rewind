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

export interface GenericWindRaster<T> {
  load(id: string): Promise<T>;
  speedAt(raster: T, pos: LngLat): WindSpeed;
}

export interface GenericView<T> {
  updateWindUV(raster: T): void;
  updateWindSpeed(raster: T): void;
  updatePosition(pos: LngLat): void;
  render(): Promise<void>;
}

export type Pixel = { x: number; y: number };

export type Scene = {
  projection: d3.GeoProjection;
  width: number;
  height: number;
  radius: number;
  center: Pixel;
};

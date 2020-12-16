import { Elm } from "./Main.elm";

type Flags = {};

export type LngLat = {
  lng: number;
  lat: number;
};

export type WindPoint = {
  position: LngLat;
  u: number;
  v: number;
};

export type WindReport = {
  id: number;
  time: number;
  wind: WindPoint;
};

type SendWind = {
  tag: "SendWind";
  report: WindReport;
};

type Disconnected = {
  tag: "Disconnected";
};

export type Input = SendWind | Disconnected;

type StartSession = {
  tag: "StartSession";
};

type GetWind = {
  tag: "GetWind";
  time: number;
  position: LngLat;
};

export type UpdateMap = {
  tag: "UpdateMap";
  updateMap: MoveTo | SetWind;
};

type MoveTo = {
  tag: "MoveTo";
  position: LngLat;
};

type SetWind = {
  tag: "SetWind";
  windReport: WindReport;
};

export type Output = StartSession | GetWind | UpdateMap;

export interface JstoElmPort<T> {
  send: (params: T) => void;
}

export interface ElmToJsPort<T> {
  subscribe: (callback: T) => void;
}

export type App = {
  ports: {
    outputs: ElmToJsPort<(output: Output) => void>;
    inputs: JstoElmPort<Input>;
  };
};

export function startApp(node: HTMLElement, flags: Flags): App {
  return Elm.Main.init({ node, flags });
}

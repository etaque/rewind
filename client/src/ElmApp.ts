import { Elm } from "./app/Main.elm";

type Flags = {};

type LngLat = {
  lng: number;
  lat: number;
};

type WindPoint = {
  position: LngLat;
  u: number;
  v: number;
};

type WindReport = {
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

type Input = SendWind | Disconnected;

type GetWind = {
  tag: "GetWind";
  time: number;
  position: LngLat;
};

type Output = GetWind;

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

export function startApplication(node: HTMLElement, flags: Flags): App {
  return Elm.Main.init({ node, flags });
}

import { Elm } from "./Main.elm";
import { Request, Response } from "../models";

type Flags = { serverUrl: string };

export interface JstoElmPort<T> {
  send: (params: T) => void;
}

export interface ElmToJsPort<T> {
  subscribe: (callback: T) => void;
}

export type App = {
  ports: {
    requests: ElmToJsPort<(request: Request) => void>;
    responses: JstoElmPort<Response>;
  };
};

export function startApp(node: HTMLElement, flags: Flags): App {
  return Elm.Main.init({ node, flags });
}

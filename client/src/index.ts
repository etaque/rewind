import "./styles.css";

import { App } from "./App";
import * as React from "react";
import * as ReactDOM from "react-dom";

const appNode = document.getElementById("app")!;

const wsAddress = process.env.REWIND_WS_URL!;
const tileServerAddress = process.env.REWIND_TILE_URL!;

const app = React.createElement(App, { wsAddress, tileServerAddress });
ReactDOM.render(app, appNode);

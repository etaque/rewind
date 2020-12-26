import { startApp } from "./app";
import { renderMap } from "./map";

import "./styles.css";

const appNode = document.getElementById("app")!;
const mapNode = document.getElementById("map")!;

const app = startApp(appNode, { serverUrl: process.env.REWIND_SERVER_URL! });

app.ports.requests.subscribe((request) => {
  switch (request.tag) {
    case "ShowMap":
      renderMap(mapNode, request.course.start);
      return;

    case "GetWindAt":
      // TODO
      return;

    case "MoveTo":
      renderMap(mapNode, request.position);
      return;

    case "LoadReport":
      // TODO
      return;
  }
});

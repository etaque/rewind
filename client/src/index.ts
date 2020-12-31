import { startApp } from "./app";
import { SphereView } from "./sphere";

import * as wind from "./wind";

import "./styles.css";

const appNode = document.getElementById("app")!;
const sphereNode = document.getElementById("sphere")!;

const serverUrl = process.env.REWIND_SERVER_URL!;

const app = startApp(appNode, { serverUrl });

let currentRaster: wind.WindRaster;
let view: SphereView;

app.ports.requests.subscribe((request) => {
  switch (request.tag) {
    case "ShowMap":
      view = new SphereView(sphereNode, request.course);
      return;

    case "GetWindAt":
      if (currentRaster) {
        app.ports.responses.send({
          tag: "WindIs",
          windSpeed: wind.speedAt(currentRaster, request.position) ?? {
            u: 0,
            v: 0,
          },
        });
      }
      return;

    case "MoveTo":
      if (view) {
        view.updatePosition(request.position);
      }
      return;

    case "LoadReport":
      wind.load(request.windReport.id, "uv").then((raster) => {
        currentRaster = raster;
        if (view) {
          view.updateWindUV(raster);
        }
      });
      wind.load(request.windReport.id, "speed").then((raster) => {
        if (view) {
          view.updateWindSpeed(raster);
        }
      });
      return;
  }
});

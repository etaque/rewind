// import { Raster } from "wkb-raster";
import { startApp } from "./app";
import { MapView } from "./map";
import { SphereView } from "./sphere";

import * as wind from "./pngWind";

import "./styles.css";
import { GenericView } from "./models";

const appNode = document.getElementById("app")!;
const sphereNode = document.getElementById("sphere")!;
const mapNode = document.getElementById("map")!;

const serverUrl = process.env.REWIND_SERVER_URL!;

const app = startApp(appNode, { serverUrl });

let currentRaster: wind.WindRaster;
let view: GenericView<wind.WindRaster>;

app.ports.requests.subscribe((request) => {
  switch (request.tag) {
    case "ShowMap":
      // view = new MapView(mapNode, request.course);
      view = new SphereView(sphereNode, request.course);
      return;

    case "GetWindAt":
      if (currentRaster) {
        app.ports.responses.send({
          tag: "WindIs",
          windSpeed: wind.speedAt(currentRaster, request.position),
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

// import { Raster } from "wkb-raster";
import { startApp } from "./app";
import { renderMap } from "./map";

import * as wind from "./pngWind";

import "./styles.css";

const appNode = document.getElementById("app")!;
const mapNode = document.getElementById("map")!;

const serverUrl = process.env.REWIND_SERVER_URL!;

const app = startApp(appNode, { serverUrl });

let currentRaster: wind.WindRaster;

app.ports.requests.subscribe((request) => {
  switch (request.tag) {
    case "ShowMap":
      renderMap(mapNode, request.course.start);
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
      renderMap(mapNode, request.position);
      return;

    case "LoadReport":
      wind.load(request.windReport.id).then((raster) => {
        currentRaster = raster;
      });
      return;
  }
});

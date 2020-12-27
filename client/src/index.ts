// import { Raster } from "wkb-raster";
import { startApp } from "./app";
import { MapView } from "./map";

import * as wind from "./pngWind";

import "./styles.css";

const appNode = document.getElementById("app")!;
const mapNode = document.getElementById("map")!;

const serverUrl = process.env.REWIND_SERVER_URL!;

const app = startApp(appNode, { serverUrl });

let currentRaster: wind.WindRaster;
let mapView: MapView;

app.ports.requests.subscribe((request) => {
  switch (request.tag) {
    case "ShowMap":
      mapView = new MapView(mapNode, request.course);
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
      if (mapView) {
        mapView.updatePosition(request.position);
      }
      return;

    case "LoadReport":
      wind.load(request.windReport.id).then((raster) => {
        currentRaster = raster;
        if (mapView) {
          mapView.updateWind(raster);
        }
      });
      return;
  }
});

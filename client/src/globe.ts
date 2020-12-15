import { sphereProjection } from "@here/harp-geoutils";
import { MapView } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";

import { hereApiKey } from "./config";
import { LngLat } from "./app/App";

export class HarpGlobe {
  readonly mapView: MapView;

  constructor(canvas: HTMLCanvasElement) {
    this.mapView = new MapView({
      canvas,
      projection: sphereProjection,
      theme: "/resources/berlin_tilezen_night_reduced.json",
      decoderUrl: "decoder.js",
    });

    this.mapView.renderLabels = false;

    this.mapView.resize(window.innerWidth, window.innerHeight);

    window.addEventListener("resize", () => {
      this.mapView.resize(window.innerWidth, window.innerHeight);
    });

    const omvDataSource = new VectorTileDataSource({
      baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
      authenticationCode: hereApiKey,
    });

    this.mapView.addDataSource(omvDataSource);
  }

  moveTo(position: LngLat) {
    console.log("moveTo", position);
    this.mapView.lookAt({ target: position, zoomLevel: 7 });
  }
}

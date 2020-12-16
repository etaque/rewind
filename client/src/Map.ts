import { sphereProjection } from "@here/harp-geoutils";
import { MapView } from "@here/harp-mapview";

import { hereApiKey } from "./config";
import { LngLat, WindReport } from "./app/App";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import {
  APIFormat,
  VectorTileDataSource,
} from "@here/harp-vectortile-datasource";

export class Map {
  readonly mapView: MapView;
  readonly tileServerAddress: string;

  private _currentDataSource?: VectorTileDataSource;
  private _currentWindReport?: WindReport;

  constructor(canvas: HTMLCanvasElement, tileServerAddress: string) {
    this.tileServerAddress = tileServerAddress;

    this.mapView = new MapView({
      canvas,
      projection: sphereProjection,
      decoderUrl: "decoder.bundle.js",
      theme: {
        extends: "/resources/berlin_tilezen_night_reduced.json",
        styles: {
          wind: [
            {
              when: ["==", ["geometry-type"], "Point"],
              technique: "circles",
              renderOrder: 10000,
              attr: {
                color: "#ca6",
                size: 6,
              },
            },
          ],
        },
      },
    });

    this.mapView.renderLabels = false;

    this.mapView.resize(window.innerWidth, window.innerHeight);

    window.addEventListener("resize", () => {
      this.mapView.resize(window.innerWidth, window.innerHeight);
    });

    const omvDataSource = new VectorTileDataSource({
      baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
      authenticationCode: hereApiKey,
      name: "base",
    });

    this.mapView.addDataSource(omvDataSource);

    const mapControls = new MapControls(this.mapView);
    mapControls.maxTiltAngle = 90;
    const ui = new MapControlsUI(mapControls, {
      zoomLevel: "input",
      projectionSwitch: true,
    });
    this.mapView.canvas.parentElement!.appendChild(ui.domElement);
  }

  moveTo(position: LngLat) {
    this.mapView.lookAt({ target: position, zoomLevel: 6 });
  }

  setWindReport(windReport: WindReport) {
    if (windReport.id != this._currentWindReport?.id) {
      const newDataSource = new VectorTileDataSource({
        apiFormat: APIFormat.XYZMVT,
        baseUrl: this.tileServerAddress + "/rpc/public.wind_tiles",
        urlParams: { wind_report_id: windReport.id.toString() },
        name: "report/" + windReport.id,
        styleSetName: "wind",
      });
      this.mapView.addDataSource(newDataSource);
      if (this._currentDataSource) {
        this.mapView.removeDataSource(this._currentDataSource);
        this._currentDataSource.dispose();
      }
      this._currentDataSource = newDataSource;
      this._currentWindReport = windReport;
    }
  }
}

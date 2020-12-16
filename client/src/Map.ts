import { sphereProjection } from "@here/harp-geoutils";
import { MapView } from "@here/harp-mapview";

import { hereApiKey } from "./config";
import { LngLat, WindReport } from "./app/App";
import { OmvDataSource } from "@here/harp-omv-datasource";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";

export class Map {
  readonly mapView: MapView;
  readonly tileServerAddress: string;

  private _currentDataSource?: OmvDataSource;
  private _currentWindReport?: WindReport;

  constructor(canvas: HTMLCanvasElement, tileServerAddress: string) {
    this.tileServerAddress = tileServerAddress;

    this.mapView = new MapView({
      canvas,
      projection: sphereProjection,
      theme: "/resources/berlin_tilezen_night_reduced.json",
      decoderUrl: "decoder.js",
    });

    const mapControls = new MapControls(this.mapView);
    const ui = new MapControlsUI(mapControls);
    // canvas.parentElement.appendChild(ui.domElement);

    this.mapView.renderLabels = false;

    this.mapView.resize(window.innerWidth, window.innerHeight);

    window.addEventListener("resize", () => {
      this.mapView.resize(window.innerWidth, window.innerHeight);
    });

    const omvDataSource = new OmvDataSource({
      baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
      authenticationCode: hereApiKey,
      name: "base",
    });

    this.mapView.addDataSource(omvDataSource);
  }

  moveTo(position: LngLat) {
    this.mapView.lookAt({ target: position, zoomLevel: 6 });
  }

  setWindReport(windReport: WindReport) {
    if (this._currentWindReport && this._currentDataSource) {
      if (this._currentWindReport.id != windReport.id) {
        this._currentDataSource.dispose();
      }
    }
    this._currentDataSource = new OmvDataSource({
      baseUrl: this.tileServerAddress + "/rpc/public.wind_tiles",
      name: "report/" + windReport.id,
    });
    this.mapView.addDataSource(this._currentDataSource);
    console.log(this._currentDataSource);
    this._currentWindReport = windReport;
  }
}

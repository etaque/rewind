import { Deck } from "@deck.gl/core";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapView, MapViewUtils } from "@here/harp-mapview";
import { MVTLayer } from "@deck.gl/geo-layers";
import { LngLat, WindReport } from "./app/App";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";
import { ViewStateProps } from "@deck.gl/core/lib/deck";

const INITIAL_VIEW_STATE: ViewStateProps = {
  latitude: 51.47,
  longitude: 0.45,
  zoom: 4,
  bearing: 0,
  pitch: 30,
};

export class Map {
  readonly mapView: MapView;
  readonly tileServerAddress: string;
  readonly deck: Deck;

  private _currentWindReport?: WindReport;

  constructor(
    mapCanvas: HTMLCanvasElement,
    deckCanvas: HTMLCanvasElement,
    tileServerAddress: string,
    hereToken: string
  ) {
    this.tileServerAddress = tileServerAddress;
    this._currentWindReport = undefined;

    this.mapView = new MapView({
      canvas: mapCanvas,
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

    // window.addEventListener("resize", () => {
    //   this.mapView.resize(window.innerWidth, window.innerHeight);
    // });

    const omvDataSource = new VectorTileDataSource({
      baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
      authenticationCode: hereToken,
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

    this.updateMapCamera(INITIAL_VIEW_STATE);

    this.deck = new Deck({
      canvas: deckCanvas,
      width: "100%",
      height: "100%",
      initialViewState: INITIAL_VIEW_STATE,
      controller: true,
      // Synchronize deck camera and map camer
      onViewStateChange: ({ viewState }) => this.updateMapCamera(viewState),
      onResize: ({ width, height }) => this.mapView.resize(width, height),
      layers: [],
      effects: [],
    });
  }

  updateMapCamera(viewState: ViewStateProps) {
    const coords = new GeoCoordinates(
      viewState.latitude!,
      viewState.longitude!
    );
    const dist = MapViewUtils.calculateDistanceFromZoomLevel(
      { focalLength: this.mapView.focalLength },
      viewState.zoom! + 1
    );
    this.mapView.lookAt(coords, dist, viewState.pitch, viewState.bearing);
    this.mapView.zoomLevel = viewState.zoom!! + 1;
  }

  moveTo(position: LngLat) {
    this.mapView.lookAt({ target: position, zoomLevel: 6 });
  }

  setWindReport(windReport: WindReport) {
    if (this._currentWindReport?.id != windReport.id) {
      const layer: any = new MVTLayer({
        id: "wind-points",
        data: `${this.tileServerAddress}/rpc/public.wind_tiles/{z}/{x}/{y}.pbf?wind_report_id=${windReport.id}`,
        minZoom: 3,
        maxZoom: 23,
        // @ts-expect-error
        getLineWidth: (f) => 15,
        lineWidthMinPixels: 1,
        getLineColor: [192, 192, 192],
      });
      this.deck.setProps({
        layers: [layer],
      });
    }
    this._currentWindReport = windReport;
  }
}

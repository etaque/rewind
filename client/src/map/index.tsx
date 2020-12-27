import "mapbox-gl/dist/mapbox-gl.css";
import { DeckGL } from "@deck.gl/react";
import { GridLayer, ContourLayer, Position } from "deck.gl";
import { ContourLayerProps } from "@deck.gl/aggregation-layers/contour-layer/contour-layer";
import { GridLayerProps } from "@deck.gl/aggregation-layers/grid-layer/grid-layer";
import { ColorRange } from "@deck.gl/core/utils/color";
import { StaticMap } from "react-map-gl";
import * as React from "react";
import * as ReactDOM from "react-dom";

import { Course, LngLat } from "../models";
import * as wind from "../pngWind";

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

export class MapView {
  readonly course: Course;
  readonly node: HTMLElement;

  raster?: wind.WindRaster;
  contourLayer?: ContourLayer<ContourLayerProps<Buffer>>;
  gridLayer?: GridLayer<GridLayerProps<Buffer>>;
  position: LngLat;

  constructor(node: HTMLElement, course: Course) {
    this.course = course;
    this.node = node;
    this.position = course.start;
    this.render();
  }

  updateWind(raster: wind.WindRaster) {
    this.raster = raster;
    const binaryData = {
      src: raster.data,
      length: raster.data.length / wind.channels,
    };
    // this.contourLayer = makeContourLayer(binaryData);
    this.gridLayer = makeGridLayer(binaryData);
    this.render();
  }

  updatePosition(pos: LngLat) {
    this.position = pos;
    this.render();
  }

  render() {
    const initialViewState = {
      zoom: 4,
      longitude: this.position.lng,
      latitude: this.position.lat,
    };
    const layers: any[] = [this.contourLayer, this.gridLayer].filter((l) => l);
    const view = (
      <DeckGL
        initialViewState={initialViewState}
        controller={true}
        layers={layers}
      >
        <StaticMap width="100%" height="100%" mapStyle={MAP_STYLE} />
      </DeckGL>
    );
    ReactDOM.render(view, this.node);
  }
}

type BinaryData = { src: Uint8Array; length: number };
type DataCursor = { index: number; data: BinaryData };

function makeContourLayer(
  data: BinaryData
): ContourLayer<ContourLayerProps<Buffer>> {
  // TODO
  const contours: Array<any> = [
    { threshold: 1, color: [255, 0, 0, 255], strokeWidth: 1 }, // => Isoline for threshold 1
    { threshold: 5, color: [0, 255, 0], strokeWidth: 2 }, // => Isoline for threshold 5
    { threshold: [6, 10], color: [0, 0, 255, 128] }, // => Isoband for threshold range [6, 10)
  ];
  return new ContourLayer({
    id: "isotachs",
    contours,
    cellSize: 200,
    opacity: 0.8,
    // @ts-expect-error
    data: data,
    // @ts-expect-error
    getPosition,
    // @ts-expect-error
    getWeight,
    gpuAggregation: true,
    aggregation: "MEAN",
  });
}

function makeGridLayer(data: BinaryData): GridLayer<GridLayerProps<Buffer>> {
  const colorRange: ColorRange = [
    [255, 255, 178, 25],
    [254, 217, 118, 85],
    [254, 178, 76, 127],
    [253, 141, 60, 170],
    [240, 59, 32, 212],
    [189, 0, 38, 255],
  ];
  return new GridLayer({
    id: "isotachs",
    opacity: 0.8,
    // @ts-expect-error
    data: data,
    // @ts-expect-error
    getPosition,
    getWeight,
    cellSizePixels: 20,
    // colorRange,
    gpuAggregation: true,
    aggregation: "MEAN",
  });
}

function getPosition(_obj: any, { index }: DataCursor): Position {
  const { lng, lat } = wind.positionOfIndex(index * length);
  if (index < 10) console.log("position", lng, lat);
  return [lng, lat];
}

function getWeight(_obj: any, { index, data }: DataCursor): number {
  const u = wind.colorToSpeed(data.src[index * length]);
  const v = wind.colorToSpeed(data.src[index * length + 1]);
  const s = Math.sqrt(u ** 2 + v ** 2);
  if (index < 10) console.log("weight", s);
  return s;
}

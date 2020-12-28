import "mapbox-gl/dist/mapbox-gl.css";
import { DeckGL } from "@deck.gl/react";
import { GridLayer, Layer, ContourLayer, Position } from "deck.gl";
import { StaticMap } from "react-map-gl";
import * as React from "react";
import * as ReactDOM from "react-dom";

import { Course, LngLat } from "../models";
import * as wind from "../pngWind";
import { LayerProps } from "@deck.gl/core/lib/layer";
import { ScreenGridLayer } from "deck.gl";

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/voyager-nolabels-gl-style/style.json";

export class MapView {
  readonly course: Course;
  readonly node: HTMLElement;

  raster?: wind.WindRaster;
  position: LngLat;
  layers: Layer<LayerProps<Buffer>>[] = [];

  constructor(node: HTMLElement, course: Course) {
    this.course = course;
    this.node = node;
    this.position = course.start;
    this.render();
  }

  updateWind(raster: wind.WindRaster) {
    this.raster = raster;
    const binData = {
      src: raster.data,
      length: raster.width * raster.height,
    };
    this.layers = [makeContourLayer(binData)];
    this.render();
  }

  updatePosition(pos: LngLat) {
    this.position = pos;
    this.render();
  }

  render() {
    const initialViewState = {
      zoom: 3,
      longitude: this.position.lng,
      latitude: this.position.lat,
    };
    const view = (
      <DeckGL
        initialViewState={initialViewState}
        controller={true}
        layers={this.layers}
      >
        <StaticMap width="100%" height="100%" mapStyle={MAP_STYLE} />
      </DeckGL>
    );
    ReactDOM.render(view, this.node);
  }
}

type BinaryData = { src: Uint8Array; length: number };
type ObjectInfo = { index: number; data: BinaryData };

const contours = [
  { threshold: [0, 5], color: "#86a3ab" },
  { threshold: [5, 10], color: "#7e98bb" },
  { threshold: [10, 15], color: "#6e90d0" },
  { threshold: [15, 20], color: "#0f94a7" },
  { threshold: [20, 25], color: "#39a239" },
  { threshold: [25, 30], color: "#c2863e" },
  { threshold: [30, 35], color: "#c8420d" },
  { threshold: [35, 40], color: "#d20032" },
  { threshold: [40, 45], color: "#af5088" },
].map(({ threshold, color }) => ({
  threshold: [kmphToMps(threshold[0]), kmphToMps(threshold[1])],
  color: hexToRgb(color)!,
}));

function makeContourLayer(data: BinaryData): Layer<LayerProps<Buffer>> {
  return new ContourLayer({
    id: "isotachs",
    contours,
    cellSize: 100000,
    opacity: 0.02,
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

function makeScreenGridLayer(data: BinaryData): Layer<LayerProps<Buffer>> {
  return new ScreenGridLayer({
    id: "grid",
    opacity: 0.05,
    // @ts-expect-error
    data,
    // @ts-expect-error
    getPosition,
    // @ts-expect-error
    getWeight,
    cellSizePixels: 20,
    gpuAggregation: true,
    aggregation: "MEAN",
  });
}

function getPosition(_obj: any, { index }: ObjectInfo): Position {
  let { lng, lat } = wind.positionOfIndex(index * wind.channels);
  return [lng, lat];
}

function getWeight(_obj: any, { index, data }: ObjectInfo): number {
  const cursor = index * wind.channels;
  const u = wind.colorToSpeed(data.src[cursor]);
  const v = wind.colorToSpeed(data.src[cursor + 1]);
  const s = Math.sqrt(u ** 2 + v ** 2);
  return s;
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : null;
}

function kmphToMps(kmph: number): number {
  return (kmph * 5) / 18;
}

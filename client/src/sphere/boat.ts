import { geoDistance, geoPath } from "d3-geo";
import { LngLat } from "../models";
import { Scene } from "./scene";
import { createBoatPolygon, getBoatSizeKm } from "./boat-geometry";

export default class Boat {
  canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  render(scene: Scene, position: LngLat, heading: number) {
    // Check if point is on the visible hemisphere
    const rotate = scene.projection.rotate();
    const center: [number, number] = [-rotate[0], -rotate[1]];
    const point: [number, number] = [position.lng, position.lat];
    if (geoDistance(center, point) > Math.PI / 2) return;

    const context = this.canvas.getContext("2d")!;
    const path = geoPath(scene.projection, context);

    const scale = scene.projection.scale();
    const sizeKm = getBoatSizeKm(scale);

    // Create boat triangle as a geo polygon
    const boatPolygon = createBoatPolygon(position, heading, sizeKm);

    context.beginPath();
    path(boatPolygon);

    context.fillStyle = "#374151";
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.5;
    context.stroke();
  }
}

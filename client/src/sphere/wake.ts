import { geoDistance, geoPath } from "d3-geo";
import type { LineString } from "geojson";
import { LngLat } from "../models";
import { Scene } from "./scene";

// Maximum number of wake points to keep
const MAX_WAKE_POINTS = 1000;
// Minimum distance between wake points in km
const MIN_DISTANCE_KM = 2;
// Max boat speed for color scaling (knots)
const MAX_SPEED = 30;
// Batch size for rendering (draw multiple segments per path for performance)
const BATCH_SIZE = 20;

type WakePoint = {
  pos: LngLat;
  speed: number; // boat speed in knots at this point
};

export default class Wake {
  canvas: HTMLCanvasElement;
  points: WakePoint[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  addPoint(position: LngLat, speed: number) {
    // Only add if far enough from last point
    if (this.points.length > 0) {
      const last = this.points[this.points.length - 1];
      const dist = haversineDistance(last.pos, position);
      if (dist < MIN_DISTANCE_KM) return;
    }

    this.points.push({ pos: position, speed });

    // Trim to max length
    if (this.points.length > MAX_WAKE_POINTS) {
      this.points.shift();
    }
  }

  render(scene: Scene) {
    if (this.points.length < 2) return;

    const context = this.canvas.getContext("2d")!;
    const rotate = scene.projection.rotate();
    const center: [number, number] = [-rotate[0], -rotate[1]];
    const path = geoPath(scene.projection, context);

    // Group segments by similar color/opacity for batched rendering
    let currentBatch: Array<[number, number][]> = [];
    let currentStyle: { color: string; opacity: number } | null = null;

    const flushBatch = () => {
      if (currentBatch.length === 0 || !currentStyle) return;

      context.beginPath();
      for (const coords of currentBatch) {
        const line: LineString = {
          type: "LineString",
          coordinates: coords,
        };
        path(line);
      }
      context.strokeStyle = currentStyle.color;
      context.globalAlpha = currentStyle.opacity;
      context.lineWidth = 2;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
      currentBatch = [];
    };

    for (let i = 1; i < this.points.length; i++) {
      const p0 = this.points[i - 1];
      const p1 = this.points[i];

      // Check if both endpoints are on back hemisphere - skip entirely
      const point0: [number, number] = [p0.pos.lng, p0.pos.lat];
      const point1: [number, number] = [p1.pos.lng, p1.pos.lat];
      if (
        geoDistance(center, point0) > Math.PI / 2 &&
        geoDistance(center, point1) > Math.PI / 2
      ) {
        continue;
      }

      // Calculate opacity based on position in array (older = more faded)
      const age = (this.points.length - i) / this.points.length;
      const opacity = Math.pow(1 - age, 0.6) * 0.9;

      // Speed-based color: blue (slow) -> cyan -> green -> yellow -> red (fast)
      const avgSpeed = (p0.speed + p1.speed) / 2;
      const color = speedToColor(avgSpeed);

      // Quantize opacity for batching (round to nearest 0.1)
      const quantizedOpacity = Math.round(opacity * 10) / 10;

      // Check if we need to start a new batch
      if (
        currentStyle === null ||
        currentStyle.color !== color ||
        currentStyle.opacity !== quantizedOpacity ||
        currentBatch.length >= BATCH_SIZE
      ) {
        flushBatch();
        currentStyle = { color, opacity: quantizedOpacity };
      }

      currentBatch.push([point0, point1]);
    }

    // Flush remaining segments
    flushBatch();
    context.globalAlpha = 1;
  }
}

// Convert speed (knots) to a color using a heat map
function speedToColor(speed: number): string {
  // Normalize speed to 0-1 range
  const t = Math.min(speed / MAX_SPEED, 1);

  // Color stops: blue -> cyan -> green -> yellow -> red
  let r: number, g: number, b: number;

  if (t < 0.25) {
    // Blue to Cyan
    const s = t / 0.25;
    r = 100;
    g = Math.round(150 + 105 * s);
    b = 255;
  } else if (t < 0.5) {
    // Cyan to Green
    const s = (t - 0.25) / 0.25;
    r = Math.round(100 - 50 * s);
    g = 255;
    b = Math.round(255 - 155 * s);
  } else if (t < 0.75) {
    // Green to Yellow
    const s = (t - 0.5) / 0.25;
    r = Math.round(50 + 205 * s);
    g = 255;
    b = 100;
  } else {
    // Yellow to Red
    const s = (t - 0.75) / 0.25;
    r = 255;
    g = Math.round(255 - 155 * s);
    b = Math.round(100 - 100 * s);
  }

  return `rgb(${r},${g},${b})`;
}

function haversineDistance(p1: LngLat, p2: LngLat): number {
  const R = 6371; // Earth radius in km
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

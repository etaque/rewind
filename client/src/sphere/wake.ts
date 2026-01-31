import { geoDistance, geoPath } from "d3-geo";
import type { LineString } from "geojson";
import { LngLat } from "../models";
import { Scene } from "./scene";
import { getBoatSizeKm } from "./boat-geometry";

// Maximum number of wake points to keep
const MAX_WAKE_POINTS = 10000;
// Minimum distance between wake points in km
const MIN_DISTANCE_KM = 2;
// Gradient zone = 1.5x boat icon length
const GRADIENT_ZONE_FACTOR = 1.5;
// Line width for the entire wake
const LINE_WIDTH = 2.5;
// Alpha values
const TAIL_ALPHA = 0.3;
const GRADIENT_ALPHA_NEAR = 0.7;
const GRADIENT_ALPHA_FAR = 0.3;

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

  clear() {
    this.points = [];
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
    const n = this.points.length;

    // Compute gradient zone length in km from boat icon size
    const gradientZoneKm =
      GRADIENT_ZONE_FACTOR * getBoatSizeKm(scene.projection.scale());

    // Pre-compute cumulative distance from the last point (nearest to boat) backward.
    // distFromBoat[i] = distance in km from point[i] to point[n-1].
    const distFromBoat = new Float64Array(n);
    distFromBoat[n - 1] = 0;
    for (let i = n - 2; i >= 0; i--) {
      distFromBoat[i] =
        distFromBoat[i + 1] +
        haversineDistance(this.points[i].pos, this.points[i + 1].pos);
    }

    // --- Tail pass: batch-render all segments beyond the gradient zone ---
    context.beginPath();
    let hasTailSegments = false;

    for (let i = 1; i < n; i++) {
      // Segment goes from points[i-1] to points[i].
      // The closer end to the boat is points[i] (higher index = newer).
      // If the closer end is still beyond the gradient zone, it's a tail segment.
      if (distFromBoat[i] < gradientZoneKm) continue;

      const p0 = this.points[i - 1];
      const p1 = this.points[i];
      const point0: [number, number] = [p0.pos.lng, p0.pos.lat];
      const point1: [number, number] = [p1.pos.lng, p1.pos.lat];

      // Skip segments on the back hemisphere
      if (
        geoDistance(center, point0) > Math.PI / 2 &&
        geoDistance(center, point1) > Math.PI / 2
      ) {
        continue;
      }

      const line: LineString = {
        type: "LineString",
        coordinates: [point0, point1],
      };
      path(line);
      hasTailSegments = true;
    }

    if (hasTailSegments) {
      context.strokeStyle = "white";
      context.globalAlpha = TAIL_ALPHA;
      context.lineWidth = LINE_WIDTH;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
    }

    // --- Gradient pass: render segments within the gradient zone individually ---
    // Alpha gradient from GRADIENT_ALPHA_NEAR (near boat) to GRADIENT_ALPHA_FAR (zone edge)
    for (let i = 1; i < n; i++) {
      // The closer end to the boat is points[i].
      if (distFromBoat[i] >= gradientZoneKm) continue;

      const p0 = this.points[i - 1];
      const p1 = this.points[i];
      const point0: [number, number] = [p0.pos.lng, p0.pos.lat];
      const point1: [number, number] = [p1.pos.lng, p1.pos.lat];

      // Skip segments on the back hemisphere
      if (
        geoDistance(center, point0) > Math.PI / 2 &&
        geoDistance(center, point1) > Math.PI / 2
      ) {
        continue;
      }

      // Interpolate alpha from near (t=0) to far (t=1)
      const midDist = (distFromBoat[i - 1] + distFromBoat[i]) / 2;
      const t = Math.min(midDist / gradientZoneKm, 1);
      const alpha =
        GRADIENT_ALPHA_NEAR + (GRADIENT_ALPHA_FAR - GRADIENT_ALPHA_NEAR) * t;

      context.beginPath();
      const line: LineString = {
        type: "LineString",
        coordinates: [point0, point1],
      };
      path(line);
      context.strokeStyle = "white";
      context.globalAlpha = alpha;
      context.lineWidth = LINE_WIDTH;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
    }

    context.globalAlpha = 1;
  }
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

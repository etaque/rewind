import { geoDistance } from "d3-geo";
import { Scene } from "./scene";
import { ProjectedPoint } from "../app/projected-path";

export default class ProjectedPath {
  canvas: HTMLCanvasElement;
  private points: ProjectedPoint[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  setPoints(points: ProjectedPoint[]) {
    this.points = points;
  }

  render(scene: Scene) {
    if (this.points.length < 2) return;

    const context = this.canvas.getContext("2d")!;
    const rotate = scene.projection.rotate();
    const center: [number, number] = [-rotate[0], -rotate[1]];

    // Draw line segments with fading opacity
    for (let i = 1; i < this.points.length; i++) {
      const p0 = this.points[i - 1];
      const p1 = this.points[i];

      const point0: [number, number] = [p0.position.lng, p0.position.lat];
      const point1: [number, number] = [p1.position.lng, p1.position.lat];

      // Skip if both points are on back hemisphere
      const d0 = geoDistance(center, point0);
      const d1 = geoDistance(center, point1);
      if (d0 > Math.PI / 2 && d1 > Math.PI / 2) continue;

      // Project points
      const proj0 = scene.projection(point0);
      const proj1 = scene.projection(point1);
      if (!proj0 || !proj1) continue;

      // Calculate opacity: fade from 0.7 to 0.1 over the path
      const progress = i / this.points.length;
      const opacity = 0.7 - progress * 0.6;

      // Draw segment
      context.beginPath();
      context.moveTo(proj0[0], proj0[1]);
      context.lineTo(proj1[0], proj1[1]);
      context.strokeStyle = `rgba(244, 114, 182, ${opacity})`; // Pink color matching boat
      context.lineWidth = 2;
      context.setLineDash([4, 4]);
      context.stroke();
    }

    // Reset line dash
    context.setLineDash([]);
  }
}

import { geoDistance, geoPath } from "d3-geo";
import { LngLat } from "../models";
import { Scene } from "./scene";
import { BoatType, createBoatPolygon, getBoatSizeKm } from "./boat-geometry";

/**
 * Draw a small padlock icon at the given position.
 * @param ctx Canvas 2D context
 * @param x Center X position
 * @param y Center Y position
 * @param size Icon size in pixels
 * @param dpr Device pixel ratio
 */
function drawLockIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  dpr: number,
): void {
  const s = size * dpr;
  const bodyWidth = s * 0.7;
  const bodyHeight = s * 0.5;
  const shackleRadius = s * 0.25;
  const shackleWidth = s * 0.1;

  // Body position (centered at x, y)
  const bodyX = x - bodyWidth / 2;
  const bodyY = y - bodyHeight / 2 + shackleRadius * 0.3;

  ctx.save();

  // Draw shackle (arc at top)
  ctx.beginPath();
  ctx.arc(x, bodyY, shackleRadius, Math.PI, 0, false);
  ctx.lineWidth = shackleWidth;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineCap = "round";
  ctx.stroke();

  // Draw body (rounded rectangle)
  const cornerRadius = s * 0.1;
  ctx.beginPath();
  ctx.roundRect(bodyX, bodyY, bodyWidth, bodyHeight, cornerRadius);
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fill();

  ctx.restore();
}

export default class Boat {
  canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  render(
    scene: Scene,
    position: LngLat,
    heading: number,
    boatType: BoatType = "imoca",
    vmgBad: boolean = false,
    twaLocked: boolean = false,
  ) {
    // Check if point is on the visible hemisphere
    const rotate = scene.projection.rotate();
    const center: [number, number] = [-rotate[0], -rotate[1]];
    const point: [number, number] = [position.lng, position.lat];
    if (geoDistance(center, point) > Math.PI / 2) return;

    const context = this.canvas.getContext("2d")!;
    const path = geoPath(scene.projection, context);

    const scale = scene.projection.scale();
    const sizeKm = getBoatSizeKm(scale);

    // Red glow under boat when VMG is bad
    if (vmgBad) {
      const boatProj = scene.projection(point);
      if (boatProj) {
        const glowRadius = 15 * scene.dpr;
        context.beginPath();
        context.arc(boatProj[0], boatProj[1], glowRadius, 0, Math.PI * 2);
        context.fillStyle = "rgba(239, 68, 68, 0.4)";
        context.fill();
        context.strokeStyle = "rgba(255, 255, 255, 0.4)";
        context.lineWidth = 1;
        context.stroke();
      }
    }

    // Create boat triangle as a geo polygon
    const boatPolygon = createBoatPolygon(position, heading, sizeKm, boatType);

    context.beginPath();
    path(boatPolygon);

    context.fillStyle = "#374151";
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.5;
    context.stroke();

    // Draw lock icon when TWA is locked
    if (twaLocked) {
      const boatProj = scene.projection(point);
      if (boatProj) {
        const offsetX = 12 * scene.dpr;
        const offsetY = -6 * scene.dpr;
        drawLockIcon(context, boatProj[0] + offsetX, boatProj[1] + offsetY, 8, scene.dpr);
      }
    }
  }
}

import { geoDistance, geoPath } from "d3-geo";
import { LngLat } from "../models";
import { Scene } from "./scene";
import { BoatType, createBoatPolygon, getBoatSizeKm } from "./boat-geometry";

/**
 * Draw a TWA arc from boat heading to wind direction.
 * @param ctx Canvas 2D context
 * @param x Boat center X position
 * @param y Boat center Y position
 * @param heading Boat heading in degrees (0 = north, clockwise)
 * @param windDirection Wind direction in degrees (direction wind is coming FROM)
 * @param dpr Device pixel ratio
 */
function drawTWAArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heading: number,
  windDirection: number,
  dpr: number,
): void {
  const radius = 14 * dpr;

  // Convert navigation angles to canvas angles
  // Navigation: 0° = north, angles increase clockwise
  // Canvas: 0 = east (right), angles increase counterclockwise (but y is flipped, so visually clockwise)
  // Formula: canvasAngle = (navAngle - 90) * π/180
  const headingRad = ((heading - 90) * Math.PI) / 180;
  const windRad = ((windDirection - 90) * Math.PI) / 180;

  // Calculate signed angular difference, normalized to [-π, π]
  let diff = windRad - headingRad;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;

  // Don't draw if facing directly into the wind (TWA ≈ 0)
  if (Math.abs(diff) < 0.05) return;

  ctx.save();

  // Draw arc from heading to wind direction, taking the shorter path
  ctx.beginPath();
  ctx.arc(x, y, radius, headingRad, windRad, diff < 0);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 1.5 * dpr;
  ctx.stroke();

  // Draw a small tick mark at the wind direction end
  const tickLength = 4 * dpr;
  const tickOuterRadius = radius + tickLength / 2;
  const tickInnerRadius = radius - tickLength / 2;
  ctx.beginPath();
  ctx.moveTo(x + tickOuterRadius * Math.cos(windRad), y + tickOuterRadius * Math.sin(windRad));
  ctx.lineTo(x + tickInnerRadius * Math.cos(windRad), y + tickInnerRadius * Math.sin(windRad));
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 1.5 * dpr;
  ctx.stroke();

  ctx.restore();
}

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
    windDirection: number | null = null,
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

    // Draw TWA arc from boat heading to wind direction
    if (windDirection !== null) {
      const boatProj = scene.projection(point);
      if (boatProj) {
        drawTWAArc(context, boatProj[0], boatProj[1], heading, windDirection, scene.dpr);
      }
    }

    // Draw lock icon when TWA is locked, positioned at the center of the arc
    if (twaLocked && windDirection !== null) {
      const boatProj = scene.projection(point);
      if (boatProj) {
        // Calculate midpoint angle between heading and wind direction
        const headingRad = ((heading - 90) * Math.PI) / 180;
        const windRad = ((windDirection - 90) * Math.PI) / 180;

        // Get signed difference normalized to [-π, π]
        let diff = windRad - headingRad;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;

        // Midpoint angle is heading + half the difference
        const midAngle = headingRad + diff / 2;

        // Position lock outside the arc (arc radius is 14, lock at ~22)
        const lockRadius = 22 * scene.dpr;
        const lockX = boatProj[0] + lockRadius * Math.cos(midAngle);
        const lockY = boatProj[1] + lockRadius * Math.sin(midAngle);

        drawLockIcon(context, lockX, lockY, 8, scene.dpr);
      }
    }
  }
}

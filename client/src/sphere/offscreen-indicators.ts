import { Scene } from "./scene";
import { PeerState } from "../multiplayer/types";
import { RecordedGhostPosition } from "./ghost-boats";

type OffscreenBoat = {
  lng: number;
  lat: number;
  name: string;
  color: string;
  textColor: string;
};

const INSET = 20;
const TRIANGLE_SIZE = 8;

/**
 * Renders directional triangles at the viewport edge pointing toward
 * off-screen peer boats and recorded ghosts.
 */
export default class OffscreenIndicators {
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  render(
    scene: Scene,
    peers: Map<string, PeerState>,
    recordedGhosts: Map<number, RecordedGhostPosition>,
  ) {
    const boats: OffscreenBoat[] = [];

    peers.forEach((peer) => {
      if (!peer.position || peer.heading == null) return;
      boats.push({
        lng: peer.position.lng,
        lat: peer.position.lat,
        name: peer.name,
        color: "rgba(34, 211, 238, 0.8)",
        textColor: "#ffffff",
      });
    });

    recordedGhosts.forEach((ghost) => {
      boats.push({
        lng: ghost.lng,
        lat: ghost.lat,
        name: ghost.name,
        color: "rgba(251, 191, 36, 0.8)",
        textColor: "#fbbf24",
      });
    });

    if (boats.length === 0) return;

    const context = this.canvas.getContext("2d")!;
    const { projection, width, height } = scene;

    // Unclipped orthographic projection parameters
    const rotate = projection.rotate();
    const λ0 = (-rotate[0] * Math.PI) / 180;
    const φ0 = (-rotate[1] * Math.PI) / 180;
    const scale = projection.scale();
    const translate = projection.translate();
    const tx = translate[0];
    const ty = translate[1];

    const sinφ0 = Math.sin(φ0);
    const cosφ0 = Math.cos(φ0);

    const cx = width / 2;
    const cy = height / 2;

    for (const boat of boats) {
      // Check if on-screen via the normal (clipped) projection
      const projected = projection([boat.lng, boat.lat]);
      if (
        projected &&
        projected[0] >= 0 &&
        projected[0] <= width &&
        projected[1] >= 0 &&
        projected[1] <= height
      ) {
        continue; // On-screen, skip
      }

      // Unclipped orthographic projection
      const λ = (boat.lng * Math.PI) / 180;
      const φ = (boat.lat * Math.PI) / 180;
      const sinφ = Math.sin(φ);
      const cosφ = Math.cos(φ);
      const dλ = λ - λ0;

      const ux = tx + scale * cosφ * Math.sin(dλ);
      const uy = ty - scale * (cosφ0 * sinφ - sinφ0 * cosφ * Math.cos(dλ));

      // Direction from viewport center to unclipped position
      const dx = ux - cx;
      const dy = uy - cy;
      if (dx === 0 && dy === 0) continue;

      // Find intersection with inset viewport rectangle
      const edge = rayRectIntersection(
        cx,
        cy,
        dx,
        dy,
        INSET,
        width - INSET,
        INSET,
        height - INSET,
      );
      if (!edge) continue;

      const angle = Math.atan2(dy, dx);

      // Draw triangle pointing toward the boat
      context.save();
      context.translate(edge.x, edge.y);
      context.rotate(angle);

      context.beginPath();
      context.moveTo(TRIANGLE_SIZE, 0);
      context.lineTo(-TRIANGLE_SIZE, -TRIANGLE_SIZE * 0.7);
      context.lineTo(-TRIANGLE_SIZE, TRIANGLE_SIZE * 0.7);
      context.closePath();

      context.fillStyle = boat.color;
      context.fill();
      context.strokeStyle = "#ffffff";
      context.lineWidth = 1.5;
      context.stroke();

      context.restore();

      // Draw name label next to the triangle, clamped within viewport
      context.font = "11px sans-serif";
      context.textAlign = "center";
      const textMetrics = context.measureText(boat.name);
      const textW = textMetrics.width / 2;

      // Offset text perpendicular to direction or along edge
      let textX = edge.x;
      let textY = edge.y - TRIANGLE_SIZE - 4;

      // Clamp text within viewport
      textX = Math.max(INSET + textW, Math.min(width - INSET - textW, textX));
      textY = Math.max(INSET + 12, Math.min(height - INSET - 4, textY));

      context.strokeStyle = "#000000";
      context.lineWidth = 2;
      context.strokeText(boat.name, textX, textY);
      context.fillStyle = boat.textColor;
      context.fillText(boat.name, textX, textY);
    }
  }
}

/**
 * Find where a ray from (cx, cy) in direction (dx, dy) intersects
 * the rectangle defined by [left, right] x [top, bottom].
 */
function rayRectIntersection(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  left: number,
  right: number,
  top: number,
  bottom: number,
): { x: number; y: number } | null {
  let tMin = Infinity;

  // Check all 4 edges
  if (dx !== 0) {
    const tLeft = (left - cx) / dx;
    if (tLeft > 0) {
      const y = cy + tLeft * dy;
      if (y >= top && y <= bottom && tLeft < tMin) tMin = tLeft;
    }
    const tRight = (right - cx) / dx;
    if (tRight > 0) {
      const y = cy + tRight * dy;
      if (y >= top && y <= bottom && tRight < tMin) tMin = tRight;
    }
  }

  if (dy !== 0) {
    const tTop = (top - cy) / dy;
    if (tTop > 0) {
      const x = cx + tTop * dx;
      if (x >= left && x <= right && tTop < tMin) tMin = tTop;
    }
    const tBottom = (bottom - cy) / dy;
    if (tBottom > 0) {
      const x = cx + tBottom * dx;
      if (x >= left && x <= right && tBottom < tMin) tMin = tBottom;
    }
  }

  if (tMin === Infinity) return null;

  return { x: cx + tMin * dx, y: cy + tMin * dy };
}

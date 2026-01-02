import { LngLat } from "../models";
import { Scene } from "./scene";

const BOAT_SIZE = 12;

export default class Boat {
  canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  render(scene: Scene, position: LngLat, heading: number) {
    const projected = scene.projection([position.lng, position.lat]);
    if (!projected) return; // Position is on the hidden side of the globe

    const [x, y] = projected;
    const context = this.canvas.getContext("2d")!;

    // Check if position is within visible sphere
    const { sphereCenter, sphereRadius } = scene;
    const dx = x - sphereCenter.x;
    const dy = y - sphereCenter.y;
    if (dx * dx + dy * dy > sphereRadius * sphereRadius) return;

    context.save();
    context.translate(x, y);
    context.rotate((heading * Math.PI) / 180);

    // Draw triangle pointing in heading direction
    context.beginPath();
    context.moveTo(0, -BOAT_SIZE); // Tip (forward)
    context.lineTo(-BOAT_SIZE * 0.6, BOAT_SIZE * 0.6); // Bottom left
    context.lineTo(BOAT_SIZE * 0.6, BOAT_SIZE * 0.6); // Bottom right
    context.closePath();

    context.fillStyle = "#f472b6"; // Pink to match the UI theme
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.5;
    context.stroke();

    context.restore();
  }
}

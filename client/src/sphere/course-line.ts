import { geoCircle, geoDistance, geoPath } from "d3-geo";
import { Course, LngLat } from "../models";
import { Scene } from "./scene";

// Fixed screen radius in pixels
const MARKER_RADIUS_PX = 8;

// Finish area radius in nautical miles
const FINISH_AREA_NM = 10;
// Convert nautical miles to degrees (1 degree ≈ 60 nm)
const FINISH_AREA_DEGREES = FINISH_AREA_NM / 60;

export default class CourseLine {
  canvas: HTMLCanvasElement;
  private course: Course;

  constructor(canvas: HTMLCanvasElement, course: Course) {
    this.canvas = canvas;
    this.course = course;
  }

  setCourse(course: Course) {
    this.course = course;
  }

  render(scene: Scene) {
    const { start, finish } = this.course;
    const context = this.canvas.getContext("2d")!;

    // Draw line between start and finish (if different)
    if (start.lng !== finish.lng || start.lat !== finish.lat) {
      this.drawLine(scene, context, start, finish);
    }

    // Draw finish area (dotted circle)
    this.drawFinishArea(scene, context, finish);

    // Draw start marker (red)
    this.drawCircle(scene, context, start, "#ef4444");

    // Draw finish marker (green) - only if different from start
    if (start.lng !== finish.lng || start.lat !== finish.lat) {
      this.drawCircle(scene, context, finish, "#22c55e");
    }
  }

  private drawLine(
    scene: Scene,
    context: CanvasRenderingContext2D,
    start: LngLat,
    finish: LngLat,
  ) {
    const path = geoPath(scene.projection, context);

    const line: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [start.lng, start.lat],
          [finish.lng, finish.lat],
        ],
      },
    };

    context.strokeStyle = "rgba(255, 255, 255, 0.2)";
    context.lineWidth = 1;
    context.setLineDash([6, 8]);
    context.beginPath();
    path(line);
    context.stroke();
    context.setLineDash([]);
  }

  private drawFinishArea(
    scene: Scene,
    context: CanvasRenderingContext2D,
    position: LngLat,
  ) {
    const path = geoPath(scene.projection, context);

    // Create a geographic circle centered on the finish point
    const circle = geoCircle()
      .center([position.lng, position.lat])
      .radius(FINISH_AREA_DEGREES);

    context.strokeStyle = "rgba(34, 197, 94, 0.6)"; // green-500 with opacity
    context.lineWidth = 1.5;
    context.setLineDash([4, 4]);
    context.beginPath();
    path(circle());
    context.stroke();
    context.setLineDash([]);
  }

  private drawCircle(
    scene: Scene,
    context: CanvasRenderingContext2D,
    position: LngLat,
    color: string,
  ) {
    // Check if point is on the visible hemisphere
    const rotate = scene.projection.rotate();
    const center: [number, number] = [-rotate[0], -rotate[1]];
    const point: [number, number] = [position.lng, position.lat];
    if (geoDistance(center, point) > Math.PI / 2) return;

    const projected = scene.projection([position.lng, position.lat]);
    if (!projected) return;

    context.beginPath();
    context.arc(projected[0], projected[1], MARKER_RADIUS_PX, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.5;
    context.stroke();
  }
}

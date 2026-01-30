import { geoDistance, geoPath } from "d3-geo";
import { Course, Gate, LngLat } from "../models";
import { Scene } from "./scene";
import { gateEndpoints } from "../app/gate-crossing";

// Fixed screen radius in pixels
const MARKER_RADIUS_PX = 8;
const BUOY_RADIUS_PX = 4;
const WAYPOINT_RADIUS_PX = 5;

export type MarkerHit =
  | { type: "start" }
  | { type: "gateCenter"; index: number }
  | { type: "finishCenter" }
  | { type: "waypoint"; leg: number; index: number };

type MarkerEntry = MarkerHit & { screenX: number; screenY: number };

// Colors for gate states
const GATE_COLOR_PASSED = "rgba(34, 197, 94, 0.8)"; // green
const GATE_COLOR_NEXT = "rgba(250, 204, 21, 0.9)"; // yellow
const GATE_COLOR_FUTURE = "rgba(156, 163, 175, 0.5)"; // gray
const FINISH_LINE_COLOR = "rgba(34, 197, 94, 0.9)"; // green

// Colors for leg states
const LEG_COLOR_PASSED = "rgba(100, 100, 100, 0.3)";
const LEG_COLOR_CURRENT = "rgba(250, 204, 21, 0.6)";
const LEG_COLOR_FUTURE = "rgba(255, 255, 255, 0.2)";

type LegState = "passed" | "current" | "future";

export default class CourseLine {
  canvas: HTMLCanvasElement;
  private course: Course;
  private nextGateIndex: number = 0;
  markers: MarkerEntry[] = [];

  constructor(canvas: HTMLCanvasElement, course: Course) {
    this.canvas = canvas;
    this.course = course;
  }

  getMarkerAt(x: number, y: number, radius = 12): MarkerEntry | null {
    // Search in reverse so topmost-rendered markers have priority
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      const dx = m.screenX - x;
      const dy = m.screenY - y;
      if (dx * dx + dy * dy <= radius * radius) return m;
    }
    return null;
  }

  setCourse(course: Course) {
    this.course = course;
  }

  setNextGateIndex(index: number) {
    this.nextGateIndex = index;
  }

  render(scene: Scene) {
    const { start, finishLine, gates, routeWaypoints } = this.course;
    const context = this.canvas.getContext("2d")!;
    const numGates = gates.length;
    const finishMidpoint = gateMidpoint(finishLine);

    // Reset markers for this render pass
    this.markers = [];

    // Build list of leg endpoints: [start, gate0, gate1, ..., gateN, finish]
    const legPoints: LngLat[] = [
      start,
      ...gates.map(gateMidpoint),
      finishMidpoint,
    ];

    // Draw all legs and waypoint dots
    for (let legIndex = 0; legIndex < legPoints.length - 1; legIndex++) {
      const from = legPoints[legIndex];
      const to = legPoints[legIndex + 1];
      const waypoints = routeWaypoints[legIndex] ?? [];

      let legState: LegState;
      if (legIndex < this.nextGateIndex) {
        legState = "passed";
      } else if (legIndex === this.nextGateIndex) {
        legState = "current";
      } else {
        legState = "future";
      }

      this.drawCourseLine(scene, context, from, to, waypoints, legState);

      // Draw waypoint dots and record markers
      for (let wpIdx = 0; wpIdx < waypoints.length; wpIdx++) {
        const wp = waypoints[wpIdx];
        const projected = this.projectIfVisible(scene, wp);
        if (projected) {
          this.drawWaypointDot(context, projected[0], projected[1]);
          this.markers.push({
            type: "waypoint",
            leg: legIndex,
            index: wpIdx,
            screenX: projected[0],
            screenY: projected[1],
          });
        }
      }
    }

    // Draw intermediate gates and record markers
    for (let i = 0; i < numGates; i++) {
      const gate = gates[i];
      let color: string;
      if (i < this.nextGateIndex) {
        color = GATE_COLOR_PASSED;
      } else if (i === this.nextGateIndex) {
        color = GATE_COLOR_NEXT;
      } else {
        color = GATE_COLOR_FUTURE;
      }
      this.drawGate(scene, context, gate, color, 2);

      const projected = this.projectIfVisible(scene, gate.center);
      if (projected) {
        this.markers.push({
          type: "gateCenter",
          index: i,
          screenX: projected[0],
          screenY: projected[1],
        });
      }
    }

    // Draw finish line and record marker
    const finishColor =
      this.nextGateIndex === numGates ? GATE_COLOR_NEXT : FINISH_LINE_COLOR;
    this.drawGate(scene, context, finishLine, finishColor, 3);
    {
      const projected = this.projectIfVisible(scene, finishLine.center);
      if (projected) {
        this.markers.push({
          type: "finishCenter",
          screenX: projected[0],
          screenY: projected[1],
        });
      }
    }

    // Draw start marker (red) and record marker
    this.drawCircle(scene, context, start, "#ef4444");
    {
      const projected = this.projectIfVisible(scene, start);
      if (projected) {
        this.markers.push({
          type: "start",
          screenX: projected[0],
          screenY: projected[1],
        });
      }
    }
  }

  private drawCourseLine(
    scene: Scene,
    context: CanvasRenderingContext2D,
    from: LngLat,
    to: LngLat,
    waypoints: LngLat[],
    legState: LegState,
  ) {
    const path = geoPath(scene.projection, context);

    // Build coordinates array: from -> waypoints -> to
    const coordinates: [number, number][] = [
      [from.lng, from.lat],
      ...waypoints.map((wp): [number, number] => [wp.lng, wp.lat]),
      [to.lng, to.lat],
    ];

    const line: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates,
      },
    };

    // Apply styling based on leg state
    switch (legState) {
      case "passed":
        context.strokeStyle = LEG_COLOR_PASSED;
        context.lineWidth = 1;
        context.setLineDash([]);
        break;
      case "current":
        context.strokeStyle = LEG_COLOR_CURRENT;
        context.lineWidth = 2;
        context.setLineDash([8, 6]);
        break;
      case "future":
        context.strokeStyle = LEG_COLOR_FUTURE;
        context.lineWidth = 1;
        context.setLineDash([6, 8]);
        break;
    }

    context.beginPath();
    path(line);
    context.stroke();
    context.setLineDash([]);
  }

  private drawGate(
    scene: Scene,
    context: CanvasRenderingContext2D,
    gate: Gate,
    color: string,
    lineWidth: number,
  ) {
    const [point1, point2] = gateEndpoints(gate);
    const path = geoPath(scene.projection, context);

    const line: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [point1.lng, point1.lat],
          [point2.lng, point2.lat],
        ],
      },
    };

    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.setLineDash([]);
    context.beginPath();
    path(line);
    context.stroke();

    // Draw buoys at gate endpoints
    this.drawBuoy(scene, context, point1, color);
    this.drawBuoy(scene, context, point2, color);
  }

  private drawBuoy(
    scene: Scene,
    context: CanvasRenderingContext2D,
    position: LngLat,
    color: string,
  ) {
    const rotate = scene.projection.rotate();
    const center: [number, number] = [-rotate[0], -rotate[1]];
    const point: [number, number] = [position.lng, position.lat];
    if (geoDistance(center, point) > Math.PI / 2) return;

    const projected = scene.projection([position.lng, position.lat]);
    if (!projected) return;

    context.beginPath();
    context.arc(projected[0], projected[1], BUOY_RADIUS_PX, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
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

  private projectIfVisible(
    scene: Scene,
    position: LngLat,
  ): [number, number] | null {
    const rotate = scene.projection.rotate();
    const center: [number, number] = [-rotate[0], -rotate[1]];
    const point: [number, number] = [position.lng, position.lat];
    if (geoDistance(center, point) > Math.PI / 2) return null;
    return scene.projection([position.lng, position.lat]) ?? null;
  }

  private drawWaypointDot(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
  ) {
    context.beginPath();
    context.arc(x, y, WAYPOINT_RADIUS_PX, 0, Math.PI * 2);
    context.fillStyle = "rgba(59, 130, 246, 0.8)"; // blue
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1;
    context.stroke();
  }
}

function gateMidpoint(gate: Gate): LngLat {
  return gate.center;
}

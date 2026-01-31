import { geoDistance, geoPath } from "d3-geo";
import { Course, Gate, LngLat } from "../models";
import { Scene } from "./scene";
import { gateEndpoints } from "../app/gate-crossing";
import { catmullRomSplineGeo } from "../catmull-rom";

// Fixed screen radius in pixels
const MARKER_RADIUS_PX = 8;
const BUOY_RADIUS_PX = 4;

// Colors for gate states
const GATE_COLOR_PASSED = "rgba(34, 197, 94, 0.8)"; // green
const GATE_COLOR_NEXT = "rgba(250, 204, 21, 0.9)"; // yellow
const GATE_COLOR_FUTURE = "rgba(156, 163, 175, 0.5)"; // gray
const FINISH_LINE_COLOR = "rgba(34, 197, 94, 0.9)"; // green

// Colors for leg states
const LEG_COLOR_PASSED = "rgba(100, 100, 100, 0.3)";
const LEG_COLOR_UPCOMING = "rgba(250, 204, 21, 0.6)";

type LegState = "passed" | "upcoming";

const SPLINE_SEGMENTS = 20;

export default class CourseLine {
  canvas: HTMLCanvasElement;
  private course: Course;
  private nextGateIndex: number = 0;

  constructor(canvas: HTMLCanvasElement, course: Course) {
    this.canvas = canvas;
    this.course = course;
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

    // Build list of leg endpoints: [start, gate0, gate1, ..., gateN, finish]
    const legPoints: LngLat[] = [
      start,
      ...gates.map(gateMidpoint),
      finishMidpoint,
    ];

    // Build one continuous coordinate path, tracking where each leg boundary falls
    const allCoords: [number, number][] = [[start.lng, start.lat]];
    const legBoundaries: number[] = [0];

    for (let legIndex = 0; legIndex < legPoints.length - 1; legIndex++) {
      const waypoints = routeWaypoints[legIndex] ?? [];
      for (const wp of waypoints) {
        allCoords.push([wp.lng, wp.lat]);
      }
      const to = legPoints[legIndex + 1];
      allCoords.push([to.lng, to.lat]);
      legBoundaries.push(allCoords.length - 1);
    }

    // Apply one continuous spline so gate junctions are smooth
    const useSpline = allCoords.length >= 3;
    const splined = useSpline
      ? catmullRomSplineGeo(allCoords, SPLINE_SEGMENTS)
      : allCoords;
    const factor = useSpline ? SPLINE_SEGMENTS : 1;

    // Draw each leg as a slice of the splined path
    for (let legIndex = 0; legIndex < legBoundaries.length - 1; legIndex++) {
      const fromIdx = legBoundaries[legIndex] * factor;
      const toIdx = legBoundaries[legIndex + 1] * factor;
      const legCoords = splined.slice(fromIdx, toIdx + 1);

      const legState: LegState =
        legIndex < this.nextGateIndex ? "passed" : "upcoming";

      this.drawLeg(scene, context, legCoords, legState);
    }

    // Draw intermediate gates
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
    }

    // Draw finish line
    const finishColor =
      this.nextGateIndex === numGates ? GATE_COLOR_NEXT : FINISH_LINE_COLOR;
    this.drawGate(scene, context, finishLine, finishColor, 3);

    // Draw start marker (red)
    this.drawCircle(scene, context, start, "#ef4444");
  }

  private drawLeg(
    scene: Scene,
    context: CanvasRenderingContext2D,
    coordinates: [number, number][],
    legState: LegState,
  ) {
    const path = geoPath(scene.projection, context);

    const line: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    };

    switch (legState) {
      case "passed":
        context.strokeStyle = LEG_COLOR_PASSED;
        context.lineWidth = 1;
        context.setLineDash([]);
        break;
      case "upcoming":
        context.strokeStyle = LEG_COLOR_UPCOMING;
        context.lineWidth = 2;
        context.setLineDash([8, 6]);
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
}

function gateMidpoint(gate: Gate): LngLat {
  return gate.center;
}


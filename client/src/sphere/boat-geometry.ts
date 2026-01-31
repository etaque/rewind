import type { Polygon } from "geojson";
import { LngLat } from "../models";

export type BoatType = "imoca" | "mini650";

// Boat size in screen pixels (approximate)
export const BOAT_SIZE_PX = 48;
// Reference scale at which BOAT_SIZE_PX is the target size
export const REFERENCE_SCALE = 4000;

/**
 * Map a polar name to a boat type.
 */
export function polarToBoatType(polar: string): BoatType {
  if (polar === "mini-650") return "mini650";
  return "imoca";
}

/**
 * Calculate boat size in km based on current projection scale.
 * This ensures consistent screen size regardless of zoom level.
 */
export function getBoatSizeKm(scale: number): number {
  return (BOAT_SIZE_PX * REFERENCE_SCALE * 111) / (scale * 360);
}

type Point = { x: number; y: number };

/**
 * Sample a cubic bezier curve into discrete points.
 * Returns `segments` points (excluding the start point).
 */
function sampleCubicBezier(
  p0: Point,
  cp1: Point,
  cp2: Point,
  p1: Point,
  segments: number,
): Point[] {
  const points: Point[] = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const x =
      mt2 * mt * p0.x +
      3 * mt2 * t * cp1.x +
      3 * mt * t2 * cp2.x +
      t2 * t * p1.x;
    const y =
      mt2 * mt * p0.y +
      3 * mt2 * t * cp1.y +
      3 * mt * t2 * cp2.y +
      t2 * t * p1.y;
    points.push({ x, y });
  }
  return points;
}

type BezierSegment = { cp1: Point; cp2: Point; end: Point };

type HullProfile = {
  bow: Point;
  starboard: [BezierSegment, BezierSegment];
  transom: Point; // port-side transom corner (starboard is last point of starboard bezier 2)
  port: [BezierSegment, BezierSegment];
};

const SAMPLES_PER_CURVE = 10;

const IMOCA_HULL: HullProfile = {
  bow: { x: 0, y: 1.0 },
  starboard: [
    {
      cp1: { x: 0.14, y: 0.8 },
      cp2: { x: 0.38, y: 0.4 },
      end: { x: 0.36, y: -0.1 },
    },
    {
      cp1: { x: 0.34, y: -0.5 },
      cp2: { x: 0.29, y: -0.72 },
      end: { x: 0.26, y: -0.85 },
    },
  ],
  transom: { x: -0.26, y: -0.85 },
  port: [
    {
      cp1: { x: -0.29, y: -0.72 },
      cp2: { x: -0.34, y: -0.5 },
      end: { x: -0.36, y: -0.1 },
    },
    {
      cp1: { x: -0.38, y: 0.4 },
      cp2: { x: -0.14, y: 0.8 },
      end: { x: 0, y: 1.0 },
    },
  ],
};

const MINI650_HULL: HullProfile = {
  bow: { x: 0, y: 1.0 },
  starboard: [
    {
      cp1: { x: 0.18, y: 0.78 },
      cp2: { x: 0.46, y: 0.35 },
      end: { x: 0.43, y: -0.05 },
    },
    {
      cp1: { x: 0.41, y: -0.4 },
      cp2: { x: 0.34, y: -0.65 },
      end: { x: 0.3, y: -0.82 },
    },
  ],
  transom: { x: -0.3, y: -0.82 },
  port: [
    {
      cp1: { x: -0.34, y: -0.65 },
      cp2: { x: -0.41, y: -0.4 },
      end: { x: -0.43, y: -0.05 },
    },
    {
      cp1: { x: -0.46, y: 0.35 },
      cp2: { x: -0.18, y: 0.78 },
      end: { x: 0, y: 1.0 },
    },
  ],
};

function hullVertices(hull: HullProfile): Point[] {
  const points: Point[] = [hull.bow];

  // Starboard side: two bezier curves from bow down to stern
  let cursor = hull.bow;
  for (const seg of hull.starboard) {
    points.push(...sampleCubicBezier(cursor, seg.cp1, seg.cp2, seg.end, SAMPLES_PER_CURVE));
    cursor = seg.end;
  }

  // Transom: straight line to port-side transom corner
  points.push(hull.transom);

  // Port side: two bezier curves from stern back up to bow
  cursor = hull.transom;
  for (const seg of hull.port) {
    points.push(...sampleCubicBezier(cursor, seg.cp1, seg.cp2, seg.end, SAMPLES_PER_CURVE));
    cursor = seg.end;
  }

  return points;
}

const HULL_PROFILES: Record<BoatType, Point[]> = {
  imoca: hullVertices(IMOCA_HULL),
  mini650: hullVertices(MINI650_HULL),
};

const SIZE_MULTIPLIER: Record<BoatType, number> = {
  imoca: 1.3,
  mini650: 1.15,
};

/**
 * Create a hull polygon in geo coordinates.
 * The hull points in the heading direction.
 */
export function createBoatPolygon(
  position: LngLat,
  heading: number,
  sizeKm: number,
  boatType: BoatType = "imoca",
): Polygon {
  const vertices = HULL_PROFILES[boatType];
  const scaledSize = sizeKm * SIZE_MULTIPLIER[boatType];

  // Convert heading to radians (0 = north, clockwise)
  const headingRad = (heading * Math.PI) / 180;

  // Convert each vertex to lat/lng
  const coords = vertices.map(({ x: dx, y: dy }) => {
    const sx = dx * scaledSize;
    const sy = dy * scaledSize;

    // Rotate by heading
    const rotatedX = sx * Math.cos(headingRad) + sy * Math.sin(headingRad);
    const rotatedY = -sx * Math.sin(headingRad) + sy * Math.cos(headingRad);

    // Convert km offset to degrees
    // 1 degree latitude ≈ 111 km
    // 1 degree longitude ≈ 111 km * cos(latitude)
    const latOffset = rotatedY / 111;
    const lngOffset =
      rotatedX / (111 * Math.cos((position.lat * Math.PI) / 180));

    return [position.lng + lngOffset, position.lat + latOffset] as [
      number,
      number,
    ];
  });

  // Close the polygon
  coords.push(coords[0]);

  return {
    type: "Polygon",
    coordinates: [coords],
  };
}

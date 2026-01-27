import { Course, Gate, LngLat } from "../models";

/**
 * Check if two line segments intersect using cross-product method.
 * Segment 1: p1 -> p2 (boat movement)
 * Segment 2: g1 -> g2 (gate line)
 */
function segmentsIntersect(
  p1: LngLat,
  p2: LngLat,
  g1: LngLat,
  g2: LngLat,
): boolean {
  // Cross product of vectors: (b - a) x (c - a) = (bx-ax)(cy-ay) - (by-ay)(cx-ax)
  const cross = (a: LngLat, b: LngLat, c: LngLat): number =>
    (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);

  // Check if point c is on segment a-b
  const onSegment = (a: LngLat, b: LngLat, c: LngLat): boolean => {
    return (
      Math.min(a.lng, b.lng) <= c.lng &&
      c.lng <= Math.max(a.lng, b.lng) &&
      Math.min(a.lat, b.lat) <= c.lat &&
      c.lat <= Math.max(a.lat, b.lat)
    );
  };

  const d1 = cross(g1, g2, p1);
  const d2 = cross(g1, g2, p2);
  const d3 = cross(p1, p2, g1);
  const d4 = cross(p1, p2, g2);

  // General case: segments straddle each other
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  // Collinear cases
  if (d1 === 0 && onSegment(g1, g2, p1)) return true;
  if (d2 === 0 && onSegment(g1, g2, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, g1)) return true;
  if (d4 === 0 && onSegment(p1, p2, g2)) return true;

  return false;
}

/**
 * Check if boat movement crosses a gate.
 */
function crossesGate(prevPos: LngLat, newPos: LngLat, gate: Gate): boolean {
  return segmentsIntersect(prevPos, newPos, gate.point1, gate.point2);
}

/**
 * Check if boat has crossed its next required gate.
 * Returns the gate index if crossed, null otherwise.
 *
 * Gate indices:
 * - 0 to gates.length-1: intermediate gates
 * - gates.length: finish line
 */
export function checkGateCrossing(
  prevPos: LngLat,
  newPos: LngLat,
  course: Course,
  nextGateIndex: number,
): number | null {
  const numGates = course.gates.length;

  // Check if we're at an intermediate gate or the finish line
  if (nextGateIndex < numGates) {
    // Check intermediate gate
    const gate = course.gates[nextGateIndex];
    if (crossesGate(prevPos, newPos, gate)) {
      return nextGateIndex;
    }
  } else if (nextGateIndex === numGates) {
    // Check finish line
    if (crossesGate(prevPos, newPos, course.finishLine)) {
      return nextGateIndex;
    }
  }

  return null;
}

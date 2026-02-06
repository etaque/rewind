import { LngLat, WindRasterSource } from "../models";
import { getBoatSpeed, calculateTWA } from "./polar";
import { isPointOnLand } from "./land";
import { Session } from "./state";
import { currentWindContext } from "./wind-context";
import { getWindDirection, getWindSpeed, msToKnots, reframeLongitude } from "../utils";
import { checkGateCrossing } from "./gate-crossing";

export type TickResult = {
  clock: number;
  courseTime: number;
  boatSpeed: number;
  position: LngLat;
  heading: number;
  targetHeading: number | null;
  lockedTWA: number | null;
  turningDuration: number;
  currentSource: WindRasterSource | null;
  nextSources: WindRasterSource[];
  gateCrossed: number | null; // gate index if crossed this tick, null otherwise
};

// Turn rate in degrees per second during a tack
const TACK_TURN_RATE = 90;
// Manual turn rate ramps from MIN to MAX over time
const MIN_TURN_RATE = 35;
const MAX_TURN_RATE = 70;
// Time constant for the exponential ramp (seconds)
const TURN_ACCEL_TAU = 0.12;

// Inertia time constant in seconds (wall-clock).
// Higher = more sluggish, lower = more responsive.
const INERTIA_TAU = 1;

export function tick(session: Session, delta: number): TickResult {
  const newClock = session.clock + delta;
  const newCourseTime =
    session.course.startTime + Math.round(newClock * session.course.timeFactor);

  const [currentSource, nextSources] = currentWindContext(
    session.courseTime,
    session.currentSource,
    session.nextSources,
  );

  let heading = session.heading;

  // Handle turning with acceleration
  let turningDuration = session.turningDuration;
  if (session.turning !== null) {
    const deltaSeconds = delta / 1000;
    const rate = MIN_TURN_RATE + (MAX_TURN_RATE - MIN_TURN_RATE) * (1 - Math.exp(-turningDuration / TURN_ACCEL_TAU));
    const maxTurn = rate * deltaSeconds;
    const factor = session.turning === "left" ? -1 : 1;
    heading = (heading + factor * maxTurn + 360) % 360;
    turningDuration += deltaSeconds;
  }

  // Handle progressive turning during tack
  let targetHeading = session.targetHeading;
  let lockedTWA = session.lockedTWA;

  if (targetHeading !== null) {
    const deltaSeconds = delta / 1000;
    const maxTurn = TACK_TURN_RATE * deltaSeconds;

    // Calculate shortest turn direction
    let diff = targetHeading - heading;
    // Normalize to -180 to 180
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;

    if (Math.abs(diff) <= maxTurn) {
      // Reached target
      heading = targetHeading;
      targetHeading = null;
      // Flip TWA lock to opposite side when tack completes
      if (lockedTWA !== null) {
        lockedTWA = -lockedTWA;
      }
    } else {
      // Turn toward target
      heading = (heading + Math.sign(diff) * maxTurn + 360) % 360;
    }
  }

  // Calculate wind direction (where wind comes FROM)
  const windDirNorm = getWindDirection(session.windSpeed);

  // Apply TWA lock: adjust heading to maintain locked TWA (only when not tacking)
  if (lockedTWA !== null && targetHeading === null) {
    // Heading = windDir - lockedTWA (signed TWA)
    heading = (windDirNorm - lockedTWA + 360) % 360;
  }

  // Calculate TWS in knots (wind is in m/s, convert to knots)
  const tws = msToKnots(getWindSpeed(session.windSpeed));

  // Calculate TWA and boat speed from polar
  const twa = calculateTWA(heading, windDirNorm);
  const targetSpeed = getBoatSpeed(session.polar, tws, twa);
  const dt = delta / 1000;
  const alpha = 1 - Math.exp(-dt / INERTIA_TAU);
  let boatSpeed = session.boatSpeed + (targetSpeed - session.boatSpeed) * alpha;

  // Move boat based on speed and heading
  // Boat speed is in knots, delta is in ms
  // 1 knot = 1.852 km/h = 0.0005144 km/s
  // Simulate time is accelerated by timeFactor
  const simDeltaSeconds = (delta / 1000) * session.course.timeFactor;
  const distanceKm = boatSpeed * 1.852 * (simDeltaSeconds / 3600);

  // Convert heading to radians (0 = north, clockwise)
  const headingRad = (heading * Math.PI) / 180;

  // Calculate position delta
  // 1 degree latitude ≈ 111 km
  // 1 degree longitude ≈ 111 km * cos(latitude)
  const latDelta = (distanceKm * Math.cos(headingRad)) / 111;
  const lngDelta =
    (distanceKm * Math.sin(headingRad)) /
    (111 * Math.cos((session.position.lat * Math.PI) / 180));

  let newPosition: LngLat = {
    lat: session.position.lat + latDelta,
    lng: reframeLongitude(session.position.lng + lngDelta),
  };

  // Check land collision - don't move if new position is on land
  if (isPointOnLand(newPosition.lng, newPosition.lat)) {
    boatSpeed = 0;
    newPosition = session.position;
  }

  // Check for gate crossing (only if position changed and not finished)
  let gateCrossed: number | null = null;
  if (
    session.finishTime === null &&
    (newPosition.lat !== session.position.lat ||
      newPosition.lng !== session.position.lng)
  ) {
    gateCrossed = checkGateCrossing(
      session.position,
      newPosition,
      session.course,
      session.nextGateIndex,
    );
  }

  return {
    clock: newClock,
    courseTime: newCourseTime,
    boatSpeed,
    position: newPosition,
    heading,
    targetHeading,
    lockedTWA,
    turningDuration,
    currentSource: currentSource,
    nextSources: nextSources,
    gateCrossed,
  };
}

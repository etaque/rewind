import { LngLat } from "../models";
import { getBoatSpeed, calculateTWA } from "./polar";
import { isPointOnLand } from "./land";
import { Session } from "./state";

export type TickResult = {
  clock: number;
  courseTime: number;
  boatSpeed: number;
  position: LngLat;
  heading: number;
  targetHeading: number | null;
  lockedTWA: number | null;
};

// Turn rate in degrees per second during a tack
const TACK_TURN_RATE = 90;

export function tick(session: Session, delta: number): TickResult {
  const newClock = session.clock + delta;
  const newCourseTime =
    session.course.startTime + Math.round(newClock * session.course.timeFactor);

  // Handle progressive turning during tack
  let heading = session.heading;
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
  const windDir =
    (Math.atan2(-session.windSpeed.u, -session.windSpeed.v) * 180) / Math.PI +
    360;
  const windDirNorm = windDir % 360;

  // Apply TWA lock: adjust heading to maintain locked TWA (only when not tacking)
  if (lockedTWA !== null && targetHeading === null) {
    // Heading = windDir - lockedTWA (signed TWA)
    heading = (windDirNorm - lockedTWA + 360) % 360;
  }

  // Calculate TWS in knots (wind is in m/s, convert to knots)
  const twsMs = Math.sqrt(session.windSpeed.u ** 2 + session.windSpeed.v ** 2);
  const tws = twsMs * 1.944;

  // Calculate TWA and boat speed from polar
  const twa = calculateTWA(heading, windDirNorm);
  const boatSpeed = getBoatSpeed(tws, twa);

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

  const newPosition: LngLat = {
    lat: session.position.lat + latDelta,
    lng: session.position.lng + lngDelta,
  };

  // Check land collision - don't move if new position is on land
  if (isPointOnLand(newPosition.lng, newPosition.lat)) {
    return {
      clock: newClock,
      courseTime: newCourseTime,
      boatSpeed: 0,
      position: session.position,
      heading,
      targetHeading,
      lockedTWA,
    };
  }

  return {
    clock: newClock,
    courseTime: newCourseTime,
    boatSpeed,
    position: newPosition,
    heading,
    targetHeading,
    lockedTWA,
  };
}

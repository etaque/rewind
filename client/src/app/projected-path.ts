import { LngLat } from "../models";
import InterpolatedWind from "../interpolated-wind";
import { getBoatSpeed, calculateTWA } from "./polar";
import { getWindDirection, getWindSpeedKnots } from "../utils";

// Projection settings
const PROJECTION_HOURS = 6;
const SAMPLE_INTERVAL_MINUTES = 15;
const SAMPLES = (PROJECTION_HOURS * 60) / SAMPLE_INTERVAL_MINUTES;

// Turn rate during tack (degrees per second of real time)
const TACK_TURN_RATE = 90;

export type ProjectedPoint = {
  position: LngLat;
  time: number;
};

/**
 * Compute projected path for the boat over the next few hours.
 * Takes into account current wind, TWA lock, target heading (tacking), and time factor.
 */
export function computeProjectedPath(
  startPosition: LngLat,
  heading: number,
  lockedTWA: number | null,
  targetHeading: number | null,
  courseTime: number,
  timeFactor: number,
  interpolatedWind: InterpolatedWind,
): ProjectedPoint[] {
  const points: ProjectedPoint[] = [
    { position: startPosition, time: courseTime },
  ];

  let currentPos = { ...startPosition };
  let currentHeading = heading;
  let currentTargetHeading = targetHeading;
  let currentLockedTWA = lockedTWA;
  let currentTime = courseTime;

  // Time step in milliseconds (game time)
  const timeStepMs = SAMPLE_INTERVAL_MINUTES * 60 * 1000;
  // Real time equivalent for the time step (for turn rate calculation)
  const realTimeStepMs = timeStepMs / timeFactor;

  for (let i = 0; i < SAMPLES; i++) {
    // Advance time
    currentTime += timeStepMs;

    // Get wind at current position and time
    const wind = interpolatedWind.speedAt(currentPos, currentTime);
    if (!wind) break;

    const tws = getWindSpeedKnots(wind);
    const windDir = getWindDirection(wind);

    // Handle progressive turning during tack
    if (currentTargetHeading !== null) {
      const realDeltaSeconds = realTimeStepMs / 1000;
      const maxTurn = TACK_TURN_RATE * realDeltaSeconds;

      // Calculate shortest turn direction
      let diff = currentTargetHeading - currentHeading;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;

      if (Math.abs(diff) <= maxTurn) {
        // Reached target
        currentHeading = currentTargetHeading;
        currentTargetHeading = null;
        // Flip TWA lock to opposite side when tack completes
        if (currentLockedTWA !== null) {
          currentLockedTWA = -currentLockedTWA;
        }
      } else {
        // Turn toward target
        currentHeading =
          (currentHeading + Math.sign(diff) * maxTurn + 360) % 360;
      }
    } else if (currentLockedTWA !== null) {
      // Apply TWA lock: adjust heading to maintain locked TWA
      currentHeading = windDir - currentLockedTWA;
      while (currentHeading < 0) currentHeading += 360;
      while (currentHeading >= 360) currentHeading -= 360;
    }

    // Calculate boat speed
    const twa = calculateTWA(currentHeading, windDir);
    const boatSpeed = getBoatSpeed(tws, twa);

    // Convert speed (knots) and time to distance
    // knots = nautical miles per hour
    // timeStepMs is in game time, need to convert to hours
    const hoursElapsed = timeStepMs / (1000 * 60 * 60);
    const distanceNm = boatSpeed * hoursElapsed;

    // Convert nautical miles to degrees (approximate)
    // 1 nautical mile = 1 minute of latitude = 1/60 degree
    const distanceDeg = distanceNm / 60;

    // Calculate new position
    const headingRad = (currentHeading * Math.PI) / 180;
    const latRad = (currentPos.lat * Math.PI) / 180;

    // Move in heading direction
    const dLat = distanceDeg * Math.cos(headingRad);
    const dLng = (distanceDeg * Math.sin(headingRad)) / Math.cos(latRad);

    currentPos = {
      lat: currentPos.lat + dLat,
      lng: currentPos.lng + dLng,
    };

    points.push({ position: currentPos, time: currentTime });
  }

  return points;
}

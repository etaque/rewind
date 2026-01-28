import { LngLat } from "../models";
import InterpolatedWind from "../interpolated-wind";
import { getBoatSpeed, calculateTWA, PolarData } from "./polar";
import { getWindDirection, getWindSpeedKnots } from "../utils";

// Projection settings
const PROJECTION_HOURS = 12;
const SAMPLE_INTERVAL_MINUTES = 30;
const SAMPLES = (PROJECTION_HOURS * 60) / SAMPLE_INTERVAL_MINUTES;

export type ProjectedPoint = {
  position: LngLat;
  boatSpeed: number;
  time: number;
};

/**
 * Compute projected path for the boat over the next few hours.
 * Takes into account current wind, TWA lock, target heading (tacking), and time factor.
 */
export function computeProjectedPath(
  startPosition: LngLat,
  heading: number,
  speed: number,
  courseTime: number,
  interpolatedWind: InterpolatedWind,
  polar: PolarData,
): ProjectedPoint[] {
  const points: ProjectedPoint[] = [
    { position: startPosition, time: courseTime, boatSpeed: speed },
  ];

  let currentPos = { ...startPosition };
  let currentHeading = heading;
  let currentTime = courseTime;

  // Time step in milliseconds (game time)
  const timeStepMs = SAMPLE_INTERVAL_MINUTES * 60 * 1000;

  for (let i = 0; i < SAMPLES; i++) {
    // Advance time
    currentTime += timeStepMs;

    // Get wind at current position and time
    const wind = interpolatedWind.speedAt(currentPos, currentTime);
    if (!wind) break;

    const tws = getWindSpeedKnots(wind);
    const windDir = getWindDirection(wind);

    // Calculate boat speed
    const twa = calculateTWA(currentHeading, windDir);
    const boatSpeed = getBoatSpeed(polar, tws, twa);

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

    points.push({
      position: currentPos,
      time: currentTime,
      boatSpeed: boatSpeed,
    });
  }

  return points;
}

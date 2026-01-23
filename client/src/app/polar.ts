import polarData from "../static/vr-imoca-full-pack.json";

type PolarTable = Record<string, Record<string, number>>;

const polar: PolarTable = polarData;

// Get sorted TWS values from polar
const twsValues = Object.keys(polar)
  .map(Number)
  .sort((a, b) => a - b);

// Get sorted TWA values from first TWS entry
const twaValues = Object.keys(polar[twsValues[0]])
  .map(Number)
  .sort((a, b) => a - b);

// Cache max polar speed (computed once)
let cachedMaxPolarSpeed: number | null = null;

/**
 * Get the polar curve (BSP values for all TWA angles) at a given TWS.
 * Uses interpolation between TWS values for smooth curves.
 * @param tws True Wind Speed in knots
 * @returns Array of { twa, bsp } points for plotting
 */
export function getPolarCurve(
  tws: number,
): Array<{ twa: number; bsp: number }> {
  return twaValues.map((twa) => ({
    twa,
    bsp: getBoatSpeed(tws, twa),
  }));
}

/**
 * Get the maximum BSP in the polar data (for scaling).
 * Result is cached after first computation.
 * @returns Maximum boat speed in knots
 */
export function getMaxPolarSpeed(): number {
  if (cachedMaxPolarSpeed !== null) {
    return cachedMaxPolarSpeed;
  }
  let max = 0;
  for (const twsKey of Object.keys(polar)) {
    for (const twaKey of Object.keys(polar[twsKey])) {
      max = Math.max(max, polar[twsKey][twaKey]);
    }
  }
  cachedMaxPolarSpeed = max;
  return max;
}

/**
 * Calculate boat speed from polar diagram using bilinear interpolation.
 * @param tws True Wind Speed in knots
 * @param twa True Wind Angle in degrees (0-180, symmetric)
 * @returns Boat speed in knots
 */
export function getBoatSpeed(tws: number, twa: number): number {
  // Normalize TWA to 0-180 (polar is symmetric)
  twa = Math.abs(twa);
  if (twa > 180) twa = 360 - twa;

  // Clamp to polar bounds
  const minTws = twsValues[0];
  const maxTws = twsValues[twsValues.length - 1];
  const minTwa = twaValues[0];
  const maxTwa = twaValues[twaValues.length - 1];

  tws = Math.max(minTws, Math.min(maxTws, tws));
  twa = Math.max(minTwa, Math.min(maxTwa, twa));

  // Find surrounding TWS values
  let twsLow = minTws;
  let twsHigh = maxTws;
  for (let i = 0; i < twsValues.length - 1; i++) {
    if (tws >= twsValues[i] && tws <= twsValues[i + 1]) {
      twsLow = twsValues[i];
      twsHigh = twsValues[i + 1];
      break;
    }
  }

  // Find surrounding TWA values
  let twaLow = minTwa;
  let twaHigh = maxTwa;
  for (let i = 0; i < twaValues.length - 1; i++) {
    if (twa >= twaValues[i] && twa <= twaValues[i + 1]) {
      twaLow = twaValues[i];
      twaHigh = twaValues[i + 1];
      break;
    }
  }

  // Get four corner values
  const v00 = polar[twsLow][twaLow];
  const v01 = polar[twsLow][twaHigh];
  const v10 = polar[twsHigh][twaLow];
  const v11 = polar[twsHigh][twaHigh];

  // Bilinear interpolation
  const twsFrac = twsHigh === twsLow ? 0 : (tws - twsLow) / (twsHigh - twsLow);
  const twaFrac = twaHigh === twaLow ? 0 : (twa - twaLow) / (twaHigh - twaLow);

  const v0 = v00 + (v01 - v00) * twaFrac;
  const v1 = v10 + (v11 - v10) * twaFrac;

  return v0 + (v1 - v0) * twsFrac;
}

/**
 * Calculate True Wind Angle from boat heading and wind direction.
 * @param heading Boat heading in degrees (0 = north, clockwise)
 * @param windDirection Wind direction in degrees (where wind comes FROM)
 * @returns TWA in degrees (0-180)
 */
export function calculateTWA(heading: number, windDirection: number): number {
  let twa = windDirection - heading;
  // Normalize to -180 to 180
  while (twa > 180) twa -= 360;
  while (twa < -180) twa += 360;
  return Math.abs(twa);
}

/**
 * Calculate VMG (Velocity Made Good) - the component of boat speed
 * in the upwind or downwind direction.
 * @param boatSpeed Boat speed in knots
 * @param twa True Wind Angle in degrees (0-180)
 * @returns VMG in knots (positive = upwind progress, can be negative for downwind)
 */
export function calculateVMG(boatSpeed: number, twa: number): number {
  const twaRad = (twa * Math.PI) / 180;
  return boatSpeed * Math.cos(twaRad);
}

export type VMGMode = "upwind" | "downwind";

/**
 * Find the optimal TWA that maximizes VMG for the given wind speed.
 * Scans the polar diagram to find the best angle.
 * @param tws True Wind Speed in knots
 * @param mode 'upwind' (TWA 0-90) or 'downwind' (TWA 90-180)
 * @returns Optimal TWA in degrees
 */
export function getOptimalVMGAngle(tws: number, mode: VMGMode): number {
  let bestVMG = -Infinity;
  let bestTWA = mode === "upwind" ? 45 : 135; // sensible defaults

  // Scan range based on mode
  const minTWA = mode === "upwind" ? 20 : 90;
  const maxTWA = mode === "upwind" ? 90 : 180;

  // Scan in 1-degree increments for precision
  for (let twa = minTWA; twa <= maxTWA; twa++) {
    const boatSpeed = getBoatSpeed(tws, twa);
    const vmg = Math.abs(calculateVMG(boatSpeed, twa));

    if (vmg > bestVMG) {
      bestVMG = vmg;
      bestTWA = twa;
    }
  }

  return bestTWA;
}

/**
 * Calculate the optimal heading for VMG based on current wind and which tack we're on.
 * @param windDirection Wind direction in degrees (where wind comes FROM)
 * @param tws True Wind Speed in knots
 * @param currentHeading Current boat heading to determine port/starboard tack
 * @returns Optimal heading in degrees
 */
export function getOptimalVMGHeading(
  windDirection: number,
  tws: number,
  currentHeading: number,
): number {
  // Determine if we're sailing upwind or downwind based on current TWA
  const currentTWA = calculateTWA(currentHeading, windDirection);
  const mode: VMGMode = currentTWA <= 90 ? "upwind" : "downwind";

  // Get optimal TWA for this mode
  const optimalTWA = getOptimalVMGAngle(tws, mode);

  // Determine which side of the wind we're on (port or starboard tack)
  // Normalize the angle difference to determine tack
  let diff = currentHeading - windDirection;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;

  // If diff > 0, wind is coming from our left (port tack, wind on port side)
  // If diff < 0, wind is coming from our right (starboard tack, wind on starboard side)
  const onPortTack = diff > 0;

  // Calculate heading: wind direction +/- optimal TWA depending on tack
  let heading: number;
  if (mode === "upwind") {
    // Upwind: heading is windDirection +/- optimalTWA
    heading = onPortTack
      ? windDirection + optimalTWA
      : windDirection - optimalTWA;
  } else {
    // Downwind: heading is windDirection + 180 +/- (180 - optimalTWA)
    const downwindOffset = 180 - optimalTWA;
    heading = onPortTack
      ? windDirection + 180 - downwindOffset
      : windDirection + 180 + downwindOffset;
  }

  // Normalize to 0-360
  while (heading < 0) heading += 360;
  while (heading >= 360) heading -= 360;

  return heading;
}

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

import { Session } from "./state";

/**
 * Calculate the target heading for a tack maneuver.
 * Returns the new targetHeading, or null if tack cannot be initiated.
 */
export function calculateTackTarget(session: Session): number | null {
  // Don't start a new tack if one is already in progress
  if (session.targetHeading !== null) return null;

  const { windSpeed, heading } = session;

  // Calculate wind direction (where wind comes FROM)
  const windDir =
    (Math.atan2(-windSpeed.u, -windSpeed.v) * 180) / Math.PI + 360;
  const windDirNorm = windDir % 360;

  // Calculate signed TWA (positive = wind from starboard, negative = wind from port)
  let signedTWA = windDirNorm - heading;
  // Normalize to -180 to 180
  while (signedTWA > 180) signedTWA -= 360;
  while (signedTWA < -180) signedTWA += 360;

  // Target heading has the same TWA magnitude but opposite sign
  return (windDirNorm + signedTWA + 360) % 360;
}

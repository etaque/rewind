import { Session } from "./state";
import { getWindDirection, getWindSpeedKnots } from "../utils";
import { getOptimalVMGHeading } from "./polar";

/**
 * Calculate the optimal VMG heading based on current conditions.
 * This will lock the boat to the best VMG angle on the current tack.
 * @returns Target heading for optimal VMG, or null if no wind
 */
export function calculateVMGLockHeading(session: Session): number | null {
  const { windSpeed, heading } = session;

  const tws = getWindSpeedKnots(windSpeed);
  if (tws < 1) {
    // Not enough wind to calculate VMG
    return null;
  }

  const windDirection = getWindDirection(windSpeed);
  return getOptimalVMGHeading(windDirection, tws, heading);
}

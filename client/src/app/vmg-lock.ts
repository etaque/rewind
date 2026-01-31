import { Session } from "./state";
import { getWindDirection, getWindSpeedKnots } from "../utils";
import { VMGMode, getOptimalVMGHeading } from "./polar";

/**
 * Calculate the optimal VMG heading based on current conditions.
 * This will lock the boat to the best VMG angle on the current tack.
 * @param mode Force upwind or downwind VMG
 * @returns Target heading for optimal VMG, or null if no wind
 */
export function calculateVMGLockHeading(
  session: Session,
  mode: VMGMode,
): number | null {
  const { windSpeed, heading, polar } = session;

  const tws = getWindSpeedKnots(windSpeed);
  if (tws < 1) {
    return null;
  }

  const windDirection = getWindDirection(windSpeed);
  return getOptimalVMGHeading(polar, windDirection, tws, heading, mode);
}

import { Session } from "./state";

/**
 * Calculate the signed TWA for locking.
 * Returns the current signed TWA (positive = wind from starboard, negative = wind from port).
 */
export function calculateSignedTWA(session: Session): number {
  const { windSpeed, heading } = session;

  const windDir =
    (Math.atan2(-windSpeed.u, -windSpeed.v) * 180) / Math.PI + 360;
  const windDirNorm = windDir % 360;

  let twa = windDirNorm - heading;
  // Normalize to -180 to 180
  while (twa > 180) twa -= 360;
  while (twa < -180) twa += 360;

  return twa;
}

/**
 * Toggle TWA lock state.
 * Returns the new lockedTWA value (signed TWA if locking, null if unlocking).
 */
export function toggleTWALock(session: Session): number | null {
  if (session.lockedTWA !== null) {
    // Unlock
    return null;
  } else {
    // Lock to current signed TWA
    return calculateSignedTWA(session);
  }
}

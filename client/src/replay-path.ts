/**
 * Binary path format (matches server encoding):
 * [4 bytes] Version (uint32 LE)
 * [4 bytes] Point count (uint32 LE)
 * [N × 20 bytes] Points:
 *   - raceTime: int64 LE (8 bytes)
 *   - lng: float32 LE (4 bytes)
 *   - lat: float32 LE (4 bytes)
 *   - heading: float32 LE (4 bytes)
 */

export interface PathPoint {
  raceTime: number;
  lng: number;
  lat: number;
  heading: number;
}

const PATH_VERSION = 1;

export async function fetchReplayPath(pathUrl: string): Promise<PathPoint[]> {
  const response = await fetch(pathUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch replay path: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return decodePath(buffer);
}

export function decodePath(buffer: ArrayBuffer): PathPoint[] {
  const view = new DataView(buffer);

  if (buffer.byteLength < 8) {
    throw new Error("Invalid path data: too short");
  }

  const version = view.getUint32(0, true);
  if (version !== PATH_VERSION) {
    throw new Error(`Unsupported path version: ${version}`);
  }

  const count = view.getUint32(4, true);
  const expectedLen = 8 + count * 20;
  if (buffer.byteLength < expectedLen) {
    throw new Error(
      `Invalid path data: expected ${expectedLen} bytes, got ${buffer.byteLength}`,
    );
  }

  const points: PathPoint[] = [];
  let offset = 8;

  for (let i = 0; i < count; i++) {
    // Read int64 as two uint32s (JS doesn't have native int64)
    const low = view.getUint32(offset, true);
    const high = view.getInt32(offset + 4, true);
    const raceTime = low + high * 0x100000000;

    points.push({
      raceTime,
      lng: view.getFloat32(offset + 8, true),
      lat: view.getFloat32(offset + 12, true),
      heading: view.getFloat32(offset + 16, true),
    });

    offset += 20;
  }

  return points;
}

/**
 * Interpolate position at a given race time.
 * Returns null if raceTime is outside the recorded path.
 */
export function interpolatePosition(
  points: PathPoint[],
  raceTime: number,
): PathPoint | null {
  if (points.length === 0) return null;
  if (raceTime <= points[0].raceTime) return points[0];
  if (raceTime >= points[points.length - 1].raceTime) {
    return points[points.length - 1];
  }

  // Binary search for the interval
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].raceTime <= raceTime) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const p1 = points[lo];
  const p2 = points[hi];
  const t = (raceTime - p1.raceTime) / (p2.raceTime - p1.raceTime);

  // Interpolate heading with shortest angular path
  let headingDiff = p2.heading - p1.heading;
  if (headingDiff > 180) headingDiff -= 360;
  if (headingDiff < -180) headingDiff += 360;

  return {
    raceTime,
    lng: p1.lng + t * (p2.lng - p1.lng),
    lat: p1.lat + t * (p2.lat - p1.lat),
    heading: (p1.heading + t * headingDiff + 360) % 360,
  };
}

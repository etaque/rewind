import { Course, LngLat } from "../models";
import { LeaderboardEntry } from "../multiplayer/types";
import { RecordedGhost } from "./hooks/useGhosts";
import { interpolatePosition, PathPoint } from "../replay-path";
import { checkGateCrossing } from "./gate-crossing";
import { haversineDistanceNm } from "../utils";

export type GhostGateCrossing = {
  gateIndex: number;
  raceTime: number;
};

/**
 * Pre-compute gate crossing times by scanning the ghost's recorded path.
 */
export function computeGateCrossings(
  path: PathPoint[],
  course: Course,
): GhostGateCrossing[] {
  const crossings: GhostGateCrossing[] = [];
  const totalGates = course.gates.length + 1; // intermediate gates + finish
  let nextGateIndex = 0;

  for (let i = 1; i < path.length && nextGateIndex < totalGates; i++) {
    const prev: LngLat = { lng: path[i - 1].lng, lat: path[i - 1].lat };
    const curr: LngLat = { lng: path[i].lng, lat: path[i].lat };

    const crossed = checkGateCrossing(prev, curr, course, nextGateIndex);
    if (crossed !== null) {
      crossings.push({ gateIndex: crossed, raceTime: path[i].raceTime });
      nextGateIndex = crossed + 1;
    }
  }

  return crossings;
}

/**
 * Build leaderboard entries for recorded ghosts at the given course time.
 */
export function ghostLeaderboardEntries(
  ghosts: Map<number, RecordedGhost>,
  course: Course,
  courseTime: number,
  crossingsCache: Map<number, GhostGateCrossing[]>,
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  ghosts.forEach((ghost) => {
    const pos = interpolatePosition(ghost.path, courseTime);
    if (!pos) return;

    let crossings = crossingsCache.get(ghost.id);
    if (!crossings) {
      crossings = computeGateCrossings(ghost.path, course);
      crossingsCache.set(ghost.id, crossings);
    }

    const crossedBefore = crossings.filter((c) => c.raceTime <= courseTime);
    const nextGateIndex = crossedBefore.length;

    const finishCrossing = crossings.find(
      (c) => c.gateIndex === course.gates.length,
    );
    const finishTime =
      finishCrossing && finishCrossing.raceTime <= courseTime
        ? finishCrossing.raceTime
        : null;

    let distanceToNextGate = 0;
    if (finishTime === null) {
      const currentPos: LngLat = { lng: pos.lng, lat: pos.lat };
      const target =
        nextGateIndex < course.gates.length
          ? course.gates[nextGateIndex].center
          : course.finishLine.center;
      distanceToNextGate = haversineDistanceNm(currentPos, target);
    }

    entries.push({
      playerId: `ghost:${ghost.id}`,
      playerName: ghost.name,
      nextGateIndex,
      distanceToNextGate,
      finishTime,
    });
  });

  return entries;
}

/**
 * Merge and sort leaderboard entries (server + ghost).
 * Sort order mirrors the server: finished first (by finish time),
 * then by gate progress (descending), then by distance (ascending).
 */
export function mergeLeaderboards(
  serverEntries: LeaderboardEntry[],
  ghostEntries: LeaderboardEntry[],
): LeaderboardEntry[] {
  const all = [...serverEntries, ...ghostEntries];

  all.sort((a, b) => {
    const aFinished = a.finishTime !== null;
    const bFinished = b.finishTime !== null;

    if (aFinished && bFinished) return a.finishTime! - b.finishTime!;
    if (aFinished) return -1;
    if (bFinished) return 1;

    if (a.nextGateIndex !== b.nextGateIndex)
      return b.nextGateIndex - a.nextGateIndex;

    return a.distanceToNextGate - b.distanceToNextGate;
  });

  return all;
}

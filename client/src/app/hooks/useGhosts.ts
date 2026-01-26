import { useState, useEffect, useCallback } from "react";
import { SphereView } from "../../sphere";
import {
  fetchReplayPath,
  interpolatePosition,
  type PathPoint,
} from "../../replay-path";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

export type RecordedGhost = {
  id: number;
  name: string;
  path: PathPoint[];
};

type GhostPosition = {
  name: string;
  lng: number;
  lat: number;
  heading: number;
};

export type GhostsState = {
  recordedGhosts: Map<number, RecordedGhost>;
  addGhost: (entryId: number, playerName: string) => Promise<void>;
  removeGhost: (ghostId: number) => void;
};

/**
 * Hook to manage recorded ghost replays.
 * Handles fetching replay paths and updating ghost positions on the sphere.
 */
export function useGhosts(
  sphereViewRef: React.RefObject<SphereView | null>,
  courseTime: number | null,
  isLobbyReady: boolean,
): GhostsState {
  const [recordedGhosts, setRecordedGhosts] = useState<
    Map<number, RecordedGhost>
  >(new Map());

  // Handle adding a ghost from Hall of Fame
  const addGhost = useCallback(
    async (entryId: number, playerName: string) => {
      // Don't add if already exists
      if (recordedGhosts.has(entryId)) return;

      try {
        // Fetch replay URL from server
        const res = await fetch(`${serverUrl}/replay/${entryId}`);
        if (!res.ok) throw new Error("Failed to fetch replay info");
        const { pathUrl } = await res.json();

        // Fetch and decode path
        const path = await fetchReplayPath(pathUrl);
        if (path.length === 0) {
          console.error("Empty replay path");
          return;
        }

        setRecordedGhosts((prev) => {
          const next = new Map(prev);
          next.set(entryId, { id: entryId, name: playerName, path });
          return next;
        });
      } catch (err) {
        console.error("Failed to load ghost:", err);
      }
    },
    [recordedGhosts],
  );

  // Handle removing a ghost
  const removeGhost = useCallback((ghostId: number) => {
    setRecordedGhosts((prev) => {
      const next = new Map(prev);
      next.delete(ghostId);
      return next;
    });
  }, []);

  // Update recorded ghost positions during gameplay
  useEffect(() => {
    if (courseTime === null || recordedGhosts.size === 0) return;
    if (!sphereViewRef.current) return;

    const ghostPositions = new Map<number, GhostPosition>();

    recordedGhosts.forEach((ghost) => {
      const pos = interpolatePosition(ghost.path, courseTime);
      if (pos) {
        ghostPositions.set(ghost.id, {
          name: ghost.name,
          lng: pos.lng,
          lat: pos.lat,
          heading: pos.heading,
        });
      }
    });

    sphereViewRef.current.updateRecordedGhosts(ghostPositions);
  }, [courseTime, recordedGhosts, sphereViewRef]);

  // Show recorded ghosts at start position in lobby
  useEffect(() => {
    if (!isLobbyReady) return;
    if (recordedGhosts.size === 0 || !sphereViewRef.current) return;

    const ghostPositions = new Map<number, GhostPosition>();

    recordedGhosts.forEach((ghost) => {
      if (ghost.path.length > 0) {
        const start = ghost.path[0];
        ghostPositions.set(ghost.id, {
          name: ghost.name,
          lng: start.lng,
          lat: start.lat,
          heading: start.heading,
        });
      }
    });

    sphereViewRef.current.updateRecordedGhosts(ghostPositions);
  }, [isLobbyReady, recordedGhosts, sphereViewRef]);

  return {
    recordedGhosts,
    addGhost,
    removeGhost,
  };
}

import { useCallback, useRef } from "react";
import { MultiplayerClient } from "../../multiplayer/client";
import { Course } from "../../models";
import { PlayerInfo, PeerState } from "../../multiplayer/types";
import { SphereView } from "../../sphere";
import { AppAction } from "../state";

type MultiplayerCallbacks = {
  onCreateRace: (playerName: string) => Promise<void>;
  onJoinRace: (raceId: string, playerName: string) => Promise<void>;
  onStartRace: () => void;
  onLeaveRace: () => void;
};

/**
 * Hook to manage multiplayer connections.
 * Returns handlers for lobby creation, joining, starting races, and leaving.
 */
export function useMultiplayer(
  dispatch: React.Dispatch<AppAction>,
  sphereViewRef: React.RefObject<SphereView | null>,
  courseRef: React.RefObject<Course | null>,
  coursesRef: React.RefObject<Map<string, Course>>,
): [React.RefObject<MultiplayerClient | null>, MultiplayerCallbacks] {
  const multiplayerRef = useRef<MultiplayerClient | null>(null);

  const createMultiplayerClient = useCallback(() => {
    return new MultiplayerClient({
      onRaceCreated: (raceId, playerId) => {
        const course = courseRef.current;
        if (!course) return;
        dispatch({
          type: "RACE_CREATED",
          raceId,
          playerId,
          course,
        });
      },
      onRaceJoined: (raceId, playerId, players, isCreator, courseKey) => {
        const course = coursesRef.current?.get(courseKey);
        if (!course) return;
        const playerMap = new Map<string, PeerState>();
        players.forEach((p: PlayerInfo) => {
          if (p.id !== playerId) {
            playerMap.set(p.id, {
              id: p.id,
              name: p.name,
              position: null,
              heading: null,
              lastUpdate: 0,
            });
          }
        });
        dispatch({
          type: "RACE_JOINED",
          raceId,
          playerId,
          course,
          isCreator,
          players: playerMap,
        });
      },
      onPlayerJoined: (playerId, playerName) => {
        dispatch({ type: "PLAYER_JOINED", playerId, playerName });
      },
      onPlayerLeft: (playerId) => {
        dispatch({ type: "PLAYER_LEFT", playerId });
        sphereViewRef.current?.removePeer(playerId);
      },
      onPeerPositionUpdate: (peerId, position, heading, name) => {
        sphereViewRef.current?.updatePeerPosition(
          peerId,
          position,
          heading,
          name,
        );
      },
      onCountdown: (seconds) => {
        dispatch({ type: "COUNTDOWN", seconds });
      },

      onRaceEnded: (reason) => {
        dispatch({ type: "RACE_ENDED", reason });
      },
      onLeaderboardUpdate: (entries) => {
        dispatch({ type: "LEADERBOARD_UPDATE", entries });
      },
      onError: (message) => {
        console.error("Multiplayer error:", message);
      },
      onDisconnect: () => {
        // Don't null the ref here - it may have already been replaced
        // by a new manager when switching races
      },
    });
  }, [dispatch, sphereViewRef, courseRef, coursesRef]);

  const handleCreateRace = useCallback(
    async (playerName: string) => {
      const course = courseRef.current;
      if (!course) return;
      const client = createMultiplayerClient();
      multiplayerRef.current = client;
      await client.connect();
      client.createRace(course.key, playerName);
    },
    [createMultiplayerClient, courseRef],
  );

  const handleJoinRace = useCallback(
    async (raceId: string, playerName: string) => {
      // Leave current race if we're in one
      if (multiplayerRef.current) {
        multiplayerRef.current.leaveRace();
        multiplayerRef.current.disconnect();
        multiplayerRef.current = null;
      }

      const client = createMultiplayerClient();
      multiplayerRef.current = client;
      await client.connect();
      client.joinRace(raceId, playerName);
    },
    [createMultiplayerClient],
  );

  const handleStartRace = useCallback(() => {
    multiplayerRef.current?.startRace();
  }, []);

  const handleLeaveRace = useCallback(() => {
    multiplayerRef.current?.leaveRace();
    multiplayerRef.current?.disconnect();
    multiplayerRef.current = null;
    dispatch({ type: "LEAVE_RACE" });
  }, [dispatch]);

  return [
    multiplayerRef,
    {
      onCreateRace: handleCreateRace,
      onJoinRace: handleJoinRace,
      onStartRace: handleStartRace,
      onLeaveRace: handleLeaveRace,
    },
  ];
}

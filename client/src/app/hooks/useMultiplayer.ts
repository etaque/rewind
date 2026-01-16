import { useCallback, useRef } from "react";
import { MultiplayerClient } from "../../multiplayer/client";
import { Course } from "../../models";
import { PlayerInfo, PeerState } from "../../multiplayer/types";
import { SphereView } from "../../sphere";
import { AppAction } from "../state";

type MultiplayerCallbacks = {
  onCreateLobby: (playerName: string) => Promise<void>;
  onJoinLobby: (lobbyId: string, playerName: string) => Promise<void>;
  onStartRace: () => void;
  onLeaveLobby: () => void;
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
      onLobbyCreated: (lobbyId, playerId) => {
        const course = courseRef.current;
        if (!course) return;
        dispatch({
          type: "LOBBY_CREATED",
          lobbyId,
          playerId,
          course,
        });
      },
      onLobbyJoined: (lobbyId, playerId, players, isCreator, courseKey) => {
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
          type: "LOBBY_JOINED",
          lobbyId,
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
      onPeerPositionUpdate: (peerId, position, heading, name, raceTime) => {
        sphereViewRef.current?.updatePeerPosition(
          peerId,
          position,
          heading,
          name,
        );
        // Sync race time from server
        dispatch({ type: "SYNC_RACE_TIME", raceTime });
      },
      onCountdown: (seconds) => {
        dispatch({ type: "COUNTDOWN", seconds });
      },
      onRaceStarted: () => {
        dispatch({ type: "RACE_STARTED" });
      },
      onRaceEnded: (reason) => {
        dispatch({ type: "RACE_ENDED", reason });
      },
      onError: (message) => {
        console.error("Multiplayer error:", message);
      },
      onDisconnect: () => {
        // Don't null the ref here - it may have already been replaced
        // by a new manager when switching lobbies
      },
    });
  }, [dispatch, sphereViewRef, courseRef, coursesRef]);

  const handleCreateLobby = useCallback(
    async (playerName: string) => {
      const course = courseRef.current;
      if (!course) return;
      const client = createMultiplayerClient();
      multiplayerRef.current = client;
      await client.connect();
      client.createLobby(course.key, playerName);
    },
    [createMultiplayerClient, courseRef],
  );

  const handleJoinLobby = useCallback(
    async (lobbyId: string, playerName: string) => {
      // Leave current lobby if we're in one
      if (multiplayerRef.current) {
        multiplayerRef.current.leaveLobby();
        multiplayerRef.current.disconnect();
        multiplayerRef.current = null;
      }

      const client = createMultiplayerClient();
      multiplayerRef.current = client;
      await client.connect();
      client.joinLobby(lobbyId, playerName);
    },
    [createMultiplayerClient],
  );

  const handleStartRace = useCallback(() => {
    multiplayerRef.current?.startRace();
  }, []);

  const handleLeaveLobby = useCallback(() => {
    multiplayerRef.current?.leaveLobby();
    multiplayerRef.current?.disconnect();
    multiplayerRef.current = null;
    dispatch({ type: "LEAVE_LOBBY" });
  }, [dispatch]);

  return [
    multiplayerRef,
    {
      onCreateLobby: handleCreateLobby,
      onJoinLobby: handleJoinLobby,
      onStartRace: handleStartRace,
      onLeaveLobby: handleLeaveLobby,
    },
  ];
}

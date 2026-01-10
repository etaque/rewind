import { useCallback, useRef } from "react";
import { WebRTCManager } from "../../multiplayer/webrtc-manager";
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
 * Hook to manage multiplayer WebRTC connections.
 * Returns handlers for lobby creation, joining, starting races, and leaving.
 */
export function useMultiplayer(
  dispatch: React.Dispatch<AppAction>,
  sphereViewRef: React.RefObject<SphereView | null>,
  courseRef: React.RefObject<Course | null>,
  coursesRef: React.RefObject<Map<string, Course>>,
): [React.RefObject<WebRTCManager | null>, MultiplayerCallbacks] {
  const webrtcManagerRef = useRef<WebRTCManager | null>(null);

  const createWebRTCManager = useCallback(() => {
    return new WebRTCManager({
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
      onRaceStarted: () => {
        dispatch({ type: "RACE_STARTED" });
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
      const manager = createWebRTCManager();
      webrtcManagerRef.current = manager;
      await manager.connect();
      manager.createLobby(course.key, playerName);
    },
    [createWebRTCManager, courseRef],
  );

  const handleJoinLobby = useCallback(
    async (lobbyId: string, playerName: string) => {
      // Leave current lobby if we're in one
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.leaveLobby();
        webrtcManagerRef.current.disconnect();
        webrtcManagerRef.current = null;
      }

      const manager = createWebRTCManager();
      webrtcManagerRef.current = manager;
      await manager.connect();
      manager.joinLobby(lobbyId, playerName);
    },
    [createWebRTCManager],
  );

  const handleStartRace = useCallback(() => {
    webrtcManagerRef.current?.startRace();
  }, []);

  const handleLeaveLobby = useCallback(() => {
    webrtcManagerRef.current?.leaveLobby();
    webrtcManagerRef.current?.disconnect();
    webrtcManagerRef.current = null;
    dispatch({ type: "LEAVE_LOBBY" });
  }, [dispatch]);

  return [
    webrtcManagerRef,
    {
      onCreateLobby: handleCreateLobby,
      onJoinLobby: handleJoinLobby,
      onStartRace: handleStartRace,
      onLeaveLobby: handleLeaveLobby,
    },
  ];
}

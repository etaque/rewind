import { useReducer, useEffect, useRef, useCallback } from "react";
import { appReducer, initialState } from "./state";
import { SphereView } from "../sphere";
import InterpolatedWind from "../interpolated-wind";
import { Course, WindReport } from "../models";
import { vg20 } from "./courses";
import StartScreen from "./StartScreen";
import StartRaceButton from "./StartRaceButton";
import Hud from "./Hud";
import CursorWind from "./CursorWind";
import { initLandData } from "./land";
import MultiplayerMenu from "./MultiplayerMenu";
import LobbyScreen from "./LobbyScreen";
import { WebRTCManager } from "../multiplayer/webrtc-manager";
import { PlayerInfo, PeerState } from "../multiplayer/types";

const serverUrl = import.meta.env.REWIND_SERVER_URL;
const WIND_REFRESH_INTERVAL = 100;

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const sphereViewRef = useRef<SphereView | null>(null);
  const interpolatedWindRef = useRef<InterpolatedWind>(new InterpolatedWind());
  const lastWindRefreshRef = useRef<number>(0);
  const sphereNodeRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(
    state.tag === "Playing" ? state.session.position : null,
  );
  const courseTimeRef = useRef(
    state.tag === "Playing" ? state.session.courseTime : 0,
  );
  const headingRef = useRef(
    state.tag === "Playing" ? state.session.heading : 0,
  );
  const webrtcManagerRef = useRef<WebRTCManager | null>(null);
  const lobbyIdRef = useRef<string | null>(null);
  const courseKeyRef = useRef<string>("vg20");

  const handleLoadCourse = useCallback((course: Course) => {
    dispatch({ type: "LOAD_COURSE", course });
  }, []);

  // Initialize SphereView and fetch reports when Loading
  useEffect(() => {
    if (state.tag !== "Loading") return;

    const course = state.course;

    // Initialize SphereView
    if (sphereNodeRef.current && !sphereViewRef.current) {
      sphereViewRef.current = new SphereView(sphereNodeRef.current, course);
    }

    // Initialize land collision data
    initLandData();

    // Fetch wind reports
    const since = course.startTime - 1000 * 60 * 60 * 24;
    const url = `${serverUrl}/wind-reports/since/${since}`;

    fetch(url)
      .then((res) => res.json())
      .then((reports: WindReport[]) => {
        dispatch({ type: "REPORTS_LOADED", reports });
      })
      .catch((err) => {
        console.error("Failed to fetch reports:", err);
        dispatch({ type: "REPORTS_ERROR" });
      });
  }, [state.tag === "Loading" ? state.course.key : null]);

  // Update interpolated wind when reports change
  useEffect(() => {
    if (state.tag !== "Playing" && state.tag !== "Ready") return;

    const { currentReport, nextReports, courseTime } = state.session;
    const interpolatedWind = interpolatedWindRef.current;

    interpolatedWind.update(currentReport, nextReports).then(() => {
      if (sphereViewRef.current) {
        const factor = interpolatedWind.getInterpolationFactor(courseTime);
        sphereViewRef.current.updateWind(interpolatedWind, factor);
      }
    });
  }, [
    state.tag === "Playing" || state.tag === "Ready"
      ? state.session.currentReport?.id
      : null,
    state.tag === "Playing" || state.tag === "Ready"
      ? state.session.nextReports[0]?.id
      : null,
  ]);

  const handleStartRace = useCallback(() => {
    dispatch({ type: "START_RACE" });
  }, []);

  // Multiplayer handlers
  const handleOpenMultiplayer = useCallback(() => {
    dispatch({ type: "OPEN_MULTIPLAYER" });
  }, []);

  const handleCloseMultiplayer = useCallback(() => {
    dispatch({ type: "CLOSE_MULTIPLAYER" });
  }, []);

  const handleCreateLobby = useCallback(async (playerName: string) => {
    const manager = new WebRTCManager({
      onLobbyCreated: (lobbyId, playerId) => {
        lobbyIdRef.current = lobbyId;
        dispatch({
          type: "LOBBY_CREATED",
          lobbyId,
          playerId,
          courseKey: courseKeyRef.current,
        });
      },
      onLobbyJoined: (lobbyId, playerId, players, isCreator) => {
        lobbyIdRef.current = lobbyId;
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
          courseKey: courseKeyRef.current,
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
      onPeerPositionUpdate: (peerId, position, heading) => {
        sphereViewRef.current?.updatePeerPosition(peerId, position, heading);
      },
      onCountdown: (seconds) => {
        dispatch({ type: "COUNTDOWN", seconds });
      },
      onRaceStarted: (_startTime, courseKey) => {
        dispatch({ type: "MULTIPLAYER_RACE_STARTED", courseKey });
      },
      onError: (message) => {
        console.error("Multiplayer error:", message);
      },
      onDisconnect: () => {
        webrtcManagerRef.current = null;
        lobbyIdRef.current = null;
      },
    });

    webrtcManagerRef.current = manager;
    await manager.connect();
    manager.createLobby(courseKeyRef.current, playerName);
  }, []);

  const handleJoinLobby = useCallback(
    async (lobbyId: string, playerName: string) => {
      const manager = new WebRTCManager({
        onLobbyCreated: (lobbyId, playerId) => {
          lobbyIdRef.current = lobbyId;
          dispatch({
            type: "LOBBY_CREATED",
            lobbyId,
            playerId,
            courseKey: courseKeyRef.current,
          });
        },
        onLobbyJoined: (lobbyId, playerId, players, isCreator) => {
          lobbyIdRef.current = lobbyId;
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
            courseKey: courseKeyRef.current,
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
        onPeerPositionUpdate: (peerId, position, heading) => {
          sphereViewRef.current?.updatePeerPosition(peerId, position, heading);
        },
        onCountdown: (seconds) => {
          dispatch({ type: "COUNTDOWN", seconds });
        },
        onRaceStarted: (_startTime, courseKey) => {
          dispatch({ type: "MULTIPLAYER_RACE_STARTED", courseKey });
        },
        onError: (message) => {
          console.error("Multiplayer error:", message);
        },
        onDisconnect: () => {
          webrtcManagerRef.current = null;
          lobbyIdRef.current = null;
        },
      });

      webrtcManagerRef.current = manager;
      await manager.connect();
      manager.joinLobby(lobbyId, playerName);
    },
    [],
  );

  const handleLobbyStartRace = useCallback(() => {
    webrtcManagerRef.current?.startRace();
  }, []);

  const handleLeaveLobby = useCallback(() => {
    webrtcManagerRef.current?.leaveLobby();
    webrtcManagerRef.current?.disconnect();
    webrtcManagerRef.current = null;
    lobbyIdRef.current = null;
    dispatch({ type: "LEAVE_LOBBY" });
  }, []);

  // Keyboard controls when Playing
  useEffect(() => {
    if (state.tag !== "Playing") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        dispatch({ type: "TURN", direction: "left" });
      } else if (e.key === "ArrowRight") {
        dispatch({ type: "TURN", direction: "right" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        dispatch({ type: "TOGGLE_TWA_LOCK" });
      } else if (e.key === " ") {
        e.preventDefault();
        dispatch({ type: "TACK" });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        dispatch({ type: "TURN", direction: null });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [state.tag]);

  // Sync position, heading, and courseTime to SphereView
  useEffect(() => {
    if (state.tag !== "Playing") return;

    // Keep refs current for the animation loop
    positionRef.current = state.session.position;
    courseTimeRef.current = state.session.courseTime;
    headingRef.current = state.session.heading;

    if (!sphereViewRef.current) return;

    sphereViewRef.current.updatePosition(
      state.session.position,
      state.session.heading,
      state.session.boatSpeed,
    );

    // Update interpolation factor for smooth wind transitions
    const interpolatedWind = interpolatedWindRef.current;
    const factor = interpolatedWind.getInterpolationFactor(
      state.session.courseTime,
    );
    sphereViewRef.current.updateWind(interpolatedWind, factor);
  }, [
    state.tag === "Playing" ? state.session.position : null,
    state.tag === "Playing" ? state.session.heading : null,
    state.tag === "Playing" ? state.session.courseTime : null,
  ]);

  // Animation loop when Playing
  useEffect(() => {
    if (state.tag !== "Playing") return;

    let animationId: number;
    let lastTime: number | null = null;
    let accumulatedClock = state.session.clock;

    const tick = (time: number) => {
      if (lastTime !== null) {
        const delta = time - lastTime;
        accumulatedClock += delta;

        dispatch({ type: "TICK", delta });

        // Check if wind refresh needed
        if (
          accumulatedClock - lastWindRefreshRef.current >
          WIND_REFRESH_INTERVAL
        ) {
          lastWindRefreshRef.current = accumulatedClock;

          const interpolatedWind = interpolatedWindRef.current;
          if (positionRef.current && courseTimeRef.current) {
            const windSpeed = interpolatedWind.speedAt(
              positionRef.current,
              courseTimeRef.current,
            ) ?? {
              u: 0,
              v: 0,
            };
            dispatch({ type: "LOCAL_WIND_UPDATED", windSpeed });
          }
        }

        // Broadcast position to multiplayer peers
        if (webrtcManagerRef.current && positionRef.current) {
          webrtcManagerRef.current.broadcastPosition(
            positionRef.current,
            headingRef.current,
          );
        }
      }
      lastTime = time;
      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, [state.tag]);

  return (
    <>
      <div ref={sphereNodeRef} id="sphere" className="fixed inset-0" />
      <div id="app" className="fixed inset-0 z-10 pointer-events-none">
        {state.tag === "Idle" && (
          <div className="pointer-events-auto">
            <StartScreen
              onStart={() => handleLoadCourse(vg20)}
              onMultiplayer={handleOpenMultiplayer}
            />
          </div>
        )}
        {state.tag === "Multiplayer" && (
          <div className="pointer-events-auto">
            <MultiplayerMenu
              onCreateLobby={handleCreateLobby}
              onJoinLobby={handleJoinLobby}
              onBack={handleCloseMultiplayer}
            />
          </div>
        )}
        {state.tag === "InLobby" && (
          <div className="pointer-events-auto">
            <LobbyScreen
              lobbyId={state.lobby.id}
              myPlayerId={state.lobby.myPlayerId}
              isCreator={state.lobby.isCreator}
              players={state.lobby.players}
              countdown={state.lobby.countdown}
              onStartRace={handleLobbyStartRace}
              onLeaveLobby={handleLeaveLobby}
            />
          </div>
        )}
        {state.tag === "Ready" && (
          <div className="pointer-events-auto">
            <StartRaceButton onStart={handleStartRace} />
          </div>
        )}
        {(state.tag === "Ready" || state.tag === "Playing") && (
          <Hud session={state.session} />
        )}
      </div>
      <CursorWind
        sphereView={sphereViewRef.current}
        courseTime={
          state.tag === "Playing" || state.tag === "Ready"
            ? state.session.courseTime
            : 0
        }
      />
    </>
  );
}

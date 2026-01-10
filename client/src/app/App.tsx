import { useReducer, useEffect, useRef, useCallback } from "react";
import { appReducer, initialState } from "./state";
import { SphereView } from "../sphere";
import InterpolatedWind from "../interpolated-wind";
import { WindReport } from "../models";
import Hud from "./Hud";
import CursorWind from "./CursorWind";
import { initLandData } from "./land";
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
  const courseKeyRef = useRef<string>("vg20");
  const reportsRef = useRef<WindReport[] | null>(null);

  // Initialize SphereView and fetch reports when Loading
  useEffect(() => {
    if (state.tag !== "Loading") return;

    const course = state.course;

    // Initialize SphereView
    if (sphereNodeRef.current && !sphereViewRef.current) {
      sphereViewRef.current = new SphereView(sphereNodeRef.current, course);
      // Render initial state (land, graticule) immediately
      sphereViewRef.current.render();
    }

    // Initialize land collision data
    initLandData();

    // Fetch wind reports
    const since = course.startTime - 1000 * 60 * 60 * 24;
    const url = `${serverUrl}/wind-reports/since/${since}`;

    fetch(url)
      .then((res) => res.json())
      .then(async (reports: WindReport[]) => {
        reportsRef.current = reports;

        // Load and display wind immediately
        if (reports.length > 0 && sphereViewRef.current) {
          // Find current report (latest one before or at startTime) and next reports
          const sortedReports = [...reports].sort((a, b) => a.time - b.time);
          let currentReport: WindReport | null = null;
          let nextReports: WindReport[] = [];

          for (let i = 0; i < sortedReports.length; i++) {
            if (sortedReports[i].time <= course.startTime) {
              currentReport = sortedReports[i];
              nextReports = sortedReports.slice(i + 1);
            } else {
              break;
            }
          }

          // If no report before startTime, use the first one
          if (!currentReport && sortedReports.length > 0) {
            currentReport = sortedReports[0];
            nextReports = sortedReports.slice(1);
          }

          if (currentReport) {
            await interpolatedWindRef.current.update(
              currentReport,
              nextReports,
            );
            const factor = interpolatedWindRef.current.getInterpolationFactor(
              course.startTime,
            );
            sphereViewRef.current.updateWind(
              interpolatedWindRef.current,
              factor,
            );
          }
        }

        dispatch({ type: "REPORTS_LOADED", reports });
      })
      .catch((err) => {
        console.error("Failed to fetch reports:", err);
        dispatch({ type: "REPORTS_ERROR" });
      });
  }, [state.tag === "Loading" ? state.course.key : null]);

  // Transition to Playing when both reports loaded and race started
  useEffect(() => {
    if (state.tag !== "Loading") return;
    if (!state.reportsLoaded || !state.lobby.raceStarted) return;
    if (!reportsRef.current) return;

    dispatch({ type: "START_PLAYING", reports: reportsRef.current });
  }, [
    state.tag === "Loading" ? state.reportsLoaded : false,
    state.tag === "Loading" ? state.lobby.raceStarted : false,
  ]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      sphereViewRef.current?.resize();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Update interpolated wind when reports change
  useEffect(() => {
    if (state.tag !== "Playing") return;

    const { currentReport, nextReports, courseTime } = state.session;
    const interpolatedWind = interpolatedWindRef.current;

    interpolatedWind.update(currentReport, nextReports).then(() => {
      if (sphereViewRef.current) {
        const factor = interpolatedWind.getInterpolationFactor(courseTime);
        sphereViewRef.current.updateWind(interpolatedWind, factor);
      }
    });
  }, [
    state.tag === "Playing" ? state.session.currentReport?.id : null,
    state.tag === "Playing" ? state.session.nextReports[0]?.id : null,
  ]);

  // Multiplayer handlers

  const createWebRTCManager = useCallback(() => {
    return new WebRTCManager({
      onLobbyCreated: (lobbyId, playerId) => {
        dispatch({
          type: "LOBBY_CREATED",
          lobbyId,
          playerId,
          courseKey: courseKeyRef.current,
        });
      },
      onLobbyJoined: (lobbyId, playerId, players, isCreator) => {
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
  }, []);

  const handleCreateLobby = useCallback(
    async (playerName: string) => {
      const manager = createWebRTCManager();
      webrtcManagerRef.current = manager;
      await manager.connect();
      manager.createLobby(courseKeyRef.current, playerName);
    },
    [createWebRTCManager],
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

  const handleLobbyStartRace = useCallback(() => {
    webrtcManagerRef.current?.startRace();
  }, []);

  const handleLeaveLobby = useCallback(() => {
    webrtcManagerRef.current?.leaveLobby();
    webrtcManagerRef.current?.disconnect();
    webrtcManagerRef.current = null;
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
        {(state.tag === "Idle" || state.tag === "Loading") && (
          <div className="pointer-events-auto">
            <LobbyScreen
              lobbyId={state.tag === "Loading" ? state.lobby.id : null}
              myPlayerId={
                state.tag === "Loading" ? state.lobby.myPlayerId : null
              }
              isCreator={
                state.tag === "Loading" ? state.lobby.isCreator : false
              }
              players={
                state.tag === "Loading" ? state.lobby.players : new Map()
              }
              countdown={state.tag === "Loading" ? state.lobby.countdown : null}
              onCreateLobby={handleCreateLobby}
              onJoinLobby={handleJoinLobby}
              onStartRace={handleLobbyStartRace}
              onLeaveLobby={handleLeaveLobby}
            />
          </div>
        )}
        {state.tag === "Playing" && <Hud session={state.session} />}
      </div>
      <CursorWind
        sphereView={sphereViewRef.current}
        courseTime={state.tag === "Playing" ? state.session.courseTime : 0}
      />
    </>
  );
}

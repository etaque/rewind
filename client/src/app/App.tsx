import { useReducer, useEffect, useRef } from "react";
import { appReducer, initialState } from "./state";
import { SphereView } from "../sphere";
import InterpolatedWind from "../interpolated-wind";
import { WindReport } from "../models";
import Hud from "./Hud";
import CursorWind from "./CursorWind";
import { initLandData } from "./land";
import LobbyScreen from "./LobbyScreen";
import { useKeyboardControls, useGameLoop, useMultiplayer } from "./hooks";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const sphereViewRef = useRef<SphereView | null>(null);
  const interpolatedWindRef = useRef<InterpolatedWind>(new InterpolatedWind());
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
  const courseKeyRef = useRef<string>("vg20");
  const reportsRef = useRef<WindReport[] | null>(null);

  // Custom hooks
  const [webrtcManagerRef, multiplayerCallbacks] = useMultiplayer(
    dispatch,
    sphereViewRef,
    courseKeyRef,
  );

  useKeyboardControls(state.tag === "Playing", dispatch);

  useGameLoop(
    state.tag === "Playing",
    state.tag === "Playing" ? state.session : null,
    dispatch,
    {
      position: positionRef,
      courseTime: courseTimeRef,
      heading: headingRef,
      interpolatedWind: interpolatedWindRef,
      webrtcManager: webrtcManagerRef,
    },
  );

  // Initialize SphereView and fetch reports when Loading
  useEffect(() => {
    if (state.tag !== "Loading") return;

    const course = state.course;

    // Initialize SphereView
    if (sphereNodeRef.current && !sphereViewRef.current) {
      sphereViewRef.current = new SphereView(sphereNodeRef.current, course);
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

  // Sync position, heading, and courseTime to SphereView
  useEffect(() => {
    if (state.tag !== "Playing") return;

    positionRef.current = state.session.position;
    courseTimeRef.current = state.session.courseTime;
    headingRef.current = state.session.heading;

    if (!sphereViewRef.current) return;

    sphereViewRef.current.updatePosition(
      state.session.position,
      state.session.heading,
      state.session.boatSpeed,
    );

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
              onCreateLobby={multiplayerCallbacks.onCreateLobby}
              onJoinLobby={multiplayerCallbacks.onJoinLobby}
              onStartRace={multiplayerCallbacks.onStartRace}
              onLeaveLobby={multiplayerCallbacks.onLeaveLobby}
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

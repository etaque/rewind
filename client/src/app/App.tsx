import { useReducer, useEffect, useRef, useCallback } from "react";
import { appReducer, initialState } from "./state";
import { SphereView } from "../sphere";
import WindRaster from "../wind-raster";
import { Course, WindReport } from "../models";
import { vg20 } from "./courses";
import StartScreen from "./StartScreen";
import StartRaceButton from "./StartRaceButton";
import Hud from "./Hud";
import CursorWind from "./CursorWind";
import { initLandData } from "./land";

const serverUrl = import.meta.env.REWIND_SERVER_URL;
const WIND_REFRESH_INTERVAL = 100;
const TURN_DELTA = 2;

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const sphereViewRef = useRef<SphereView | null>(null);
  const windRasterRef = useRef<WindRaster | null>(null);
  const lastWindRefreshRef = useRef<number>(0);
  const sphereNodeRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(
    state.tag === "Playing" ? state.session.position : null,
  );

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

  // Load current wind report if changed
  useEffect(() => {
    if (state.tag !== "Playing" && state.tag !== "Ready") return;
    if (!state.session.currentReport) return;

    WindRaster.load(state.session.currentReport.id).then((wind) => {
      windRasterRef.current = wind;
      if (sphereViewRef.current) {
        sphereViewRef.current.updateWind(wind);
      }
    });
  }, [
    state.tag === "Playing" || state.tag == "Ready"
      ? state.session.currentReport
      : null,
  ]);

  const handleStartRace = useCallback(() => {
    dispatch({ type: "START_RACE" });
  }, []);

  // Keyboard controls when Playing
  useEffect(() => {
    if (state.tag !== "Playing") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        dispatch({ type: "TURN", delta: -TURN_DELTA });
      } else if (e.key === "ArrowRight") {
        dispatch({ type: "TURN", delta: TURN_DELTA });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        dispatch({ type: "TOGGLE_TWA_LOCK" });
      } else if (e.key === " ") {
        e.preventDefault();
        dispatch({ type: "TACK" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.tag]);

  // Sync position and heading to SphereView
  useEffect(() => {
    if (state.tag !== "Playing") return;

    // Keep positionRef current for the animation loop
    positionRef.current = state.session.position;

    if (!sphereViewRef.current) return;

    sphereViewRef.current.updatePosition(
      state.session.position,
      state.session.heading,
      state.session.boatSpeed,
    );
  }, [
    state.tag === "Playing" ? state.session.position : null,
    state.tag === "Playing" ? state.session.heading : null,
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

          if (windRasterRef.current && positionRef.current) {
            const windSpeed = windRasterRef.current.speedAt(
              positionRef.current,
            ) ?? {
              u: 0,
              v: 0,
            };
            dispatch({ type: "LOCAL_WIND_UPDATED", windSpeed });
          }
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
            <StartScreen onStart={() => handleLoadCourse(vg20)} />
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
      <CursorWind sphereView={sphereViewRef.current} />
    </>
  );
}

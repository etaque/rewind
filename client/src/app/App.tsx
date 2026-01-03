import { useReducer, useEffect, useRef, useCallback } from "react";
import { appReducer, initialState } from "./state";
import { SphereView } from "../sphere";
import Wind from "../wind";
import { Course, WindReport } from "../models";
import { vg20 } from "./courses";
import StartScreen from "./StartScreen";
import StartRaceButton from "./StartRaceButton";
import Hud from "./Hud";
import { initLandData } from "./land";

const serverUrl = import.meta.env.REWIND_SERVER_URL;
const WIND_REFRESH_INTERVAL = 1000;
const TURN_DELTA = 2;

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const sphereViewRef = useRef<SphereView | null>(null);
  const windRef = useRef<Wind | null>(null);
  const lastWindRefreshRef = useRef<number>(0);
  const sphereNodeRef = useRef<HTMLDivElement>(null);

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
    const url = `${serverUrl}/wind-reports/since/${course.startTime}`;
    console.log("Fetching wind reports from:", url);

    fetch(url)
      .then((res) => res.json())
      .then((reports: WindReport[]) => {
        console.log("Received reports:", reports);
        dispatch({ type: "REPORTS_LOADED", reports });
      })
      .catch((err) => {
        console.error("Failed to fetch reports:", err);
        dispatch({ type: "REPORTS_ERROR" });
      });
  }, [state.tag === "Loading" ? state.course.key : null]);

  // Load first wind report after reports are loaded
  useEffect(() => {
    if (state.tag !== "Loading") return;
    if (!state.session || state.session.reports.length === 0) return;

    const firstReport = state.session.reports[0];

    Wind.load(firstReport.id, "uv").then((wind) => {
      windRef.current = wind;
      if (sphereViewRef.current) {
        sphereViewRef.current.updateWind(wind);
      }
      dispatch({ type: "WIND_LOADED" });
    });
  }, [state.tag === "Loading" && state.session ? state.session.reports : null]);

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
    if (!sphereViewRef.current) return;

    sphereViewRef.current.updatePosition(
      state.session.position,
      state.session.heading,
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

          if (windRef.current) {
            const windSpeed = windRef.current.speedAt(
              state.session.position,
            ) ?? {
              u: 0,
              v: 0,
            };
            dispatch({ type: "WIND_UPDATED", windSpeed });
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
        {state.tag === "Playing" && (
          <Hud
            position={state.session.position}
            heading={state.session.heading}
            courseTime={state.session.courseTime}
            windSpeed={state.session.windSpeed}
            boatSpeed={state.session.boatSpeed}
          />
        )}
      </div>
    </>
  );
}

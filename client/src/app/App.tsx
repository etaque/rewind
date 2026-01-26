import {
  useReducer,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { appReducer, initialState } from "./state";
import { SphereView } from "../sphere";
import InterpolatedWind from "../interpolated-wind";
import { Course } from "../models";
import Hud from "./Hud";
import CursorWind from "./CursorWind";
import Leaderboard from "./Leaderboard";
import PolarDiagram from "./PolarDiagram";
import { initLandData } from "./land";
import RaceChoiceScreen from "./RaceChoiceScreen";
import { useKeyboardControls, useGameLoop, useMultiplayer } from "./hooks";
import { computeProjectedPath } from "./projected-path";
import { CountdownDisplay } from "./race";
import { currentWindContext } from "./wind-context";
import { calculateTWA } from "./polar";
import { getWindDirection, getWindSpeedKnots } from "../utils";
import FinishOverlay from "./FinishOverlay";
import {
  fetchReplayPath,
  interpolatePosition,
  type PathPoint,
} from "../replay-path";
import { RaceContext, RaceContextValue } from "./race-context";

export type RecordedGhost = {
  id: number;
  name: string;
  path: PathPoint[];
};

const serverUrl = import.meta.env.REWIND_SERVER_URL;

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseKey, setSelectedCourseKey] = useState<string | null>(
    null,
  );
  const [recordedGhosts, setRecordedGhosts] = useState<
    Map<number, RecordedGhost>
  >(new Map());
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

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
  const coursesRef = useRef<Map<string, Course>>(new Map());
  const selectedCourseRef = useRef<Course | null>(null);

  // Sync selectedCourseRef when selectedCourseKey changes
  useEffect(() => {
    if (selectedCourseKey) {
      const course = coursesRef.current.get(selectedCourseKey) || null;
      selectedCourseRef.current = course;
      if (course && sphereViewRef.current) {
        sphereViewRef.current.setCourse(course);
      }
    }
  }, [selectedCourseKey]);

  // Sync course to SphereView when joining a race (course may differ from selectedCourseKey)
  useEffect(() => {
    if (state.tag === "Lobby" && sphereViewRef.current) {
      sphereViewRef.current.setCourse(state.course);
    }
  }, [state.tag === "Lobby" ? state.course.key : null]);

  // Fetch courses on startup
  useEffect(() => {
    fetch(`${serverUrl}/courses`)
      .then((res) => res.json())
      .then((fetchedCourses: Course[]) => {
        const courseMap = new Map<string, Course>();
        fetchedCourses.forEach((c) => courseMap.set(c.key, c));
        coursesRef.current = courseMap;
        setCourses(fetchedCourses);
        // Select first course by default
        if (fetchedCourses.length > 0) {
          selectedCourseRef.current = fetchedCourses[0];
          setSelectedCourseKey(fetchedCourses[0].key);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch courses:", err);
      });
  }, []);

  // Custom hooks
  const [multiplayerRef, multiplayerCallbacks] = useMultiplayer(
    dispatch,
    sphereViewRef,
    selectedCourseRef,
    coursesRef,
  );

  // Handle adding a ghost from Hall of Fame
  const handleAddGhost = useCallback(
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
  const handleRemoveGhost = useCallback((ghostId: number) => {
    setRecordedGhosts((prev) => {
      const next = new Map(prev);
      next.delete(ghostId);
      return next;
    });
  }, []);

  // Handle quitting the race
  const handleQuitRace = useCallback(() => {
    if (multiplayerRef.current) {
      multiplayerRef.current.leaveRace();
      multiplayerRef.current.disconnect();
    }
    interpolatedWindRef.current = new InterpolatedWind();
    dispatch({ type: "LEAVE_RACE" });
    setShowQuitConfirm(false);
  }, []);

  // Handle quit button click - show confirmation or quit directly
  const handleQuitClick = useCallback(() => {
    // Check if we need confirmation (during countdown or active racing)
    const needsConfirm =
      state.tag === "Countdown" ||
      (state.tag === "Playing" && state.session.finishTime === null);

    if (needsConfirm) {
      setShowQuitConfirm(true);
    } else {
      handleQuitRace();
    }
  }, [state, handleQuitRace]);

  // Handle course change - need to leave current race and create new one
  const handleCourseChange = useCallback(
    async (courseKey: string) => {
      // Update selected course
      setSelectedCourseKey(courseKey);
      selectedCourseRef.current = coursesRef.current.get(courseKey) || null;

      // Leave current race and create new one with new course
      if (multiplayerRef.current) {
        multiplayerRef.current.leaveRace();
        multiplayerRef.current.disconnect();
      }
      interpolatedWindRef.current = new InterpolatedWind();
      dispatch({ type: "LEAVE_RACE" });

      // Small delay to ensure state is updated before creating new race
      setTimeout(() => {
        const savedName =
          localStorage.getItem("rewind:player_name") || "Skipper";
        multiplayerCallbacks.onCreateRace(savedName);
      }, 100);
    },
    [multiplayerCallbacks, dispatch],
  );

  useKeyboardControls(state.tag === "Playing", dispatch);

  // Escape key to quit race
  useEffect(() => {
    if (state.tag !== "Countdown" && state.tag !== "Playing") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showQuitConfirm) {
          setShowQuitConfirm(false);
        } else {
          handleQuitClick();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.tag, showQuitConfirm, handleQuitClick]);

  useGameLoop(
    state.tag === "Playing",
    state.tag === "Playing" ? state.session : null,
    dispatch,
    {
      position: positionRef,
      courseTime: courseTimeRef,
      heading: headingRef,
      interpolatedWind: interpolatedWindRef,
      multiplayer: multiplayerRef,
    },
  );

  // Build the race context value
  const raceContextValue = useMemo<RaceContextValue>(
    () => ({
      // Race state
      raceId: state.tag === "Lobby" ? state.race.id : null,
      myPlayerId: state.tag === "Lobby" ? state.race.myPlayerId : null,
      isCreator: state.tag === "Lobby" ? state.race.isCreator : false,
      players: state.tag === "Lobby" ? state.race.players : new Map(),
      windStatus: state.tag === "Lobby" ? state.wind.status : "idle",

      // Course state
      courses,
      selectedCourseKey,

      // Ghosts
      recordedGhosts,

      // Race actions
      createRace: multiplayerCallbacks.onCreateRace,
      joinRace: multiplayerCallbacks.onJoinRace,
      startRace: multiplayerCallbacks.onStartRace,
      leaveRace: multiplayerCallbacks.onLeaveRace,

      // Course actions
      changeCourse: handleCourseChange,

      // Ghost actions
      addGhost: handleAddGhost,
      removeGhost: handleRemoveGhost,
    }),
    [
      state,
      courses,
      selectedCourseKey,
      recordedGhosts,
      multiplayerCallbacks,
      handleCourseChange,
      handleAddGhost,
      handleRemoveGhost,
    ],
  );

  // Initialize SphereView and load wind when entering Lobby state
  useEffect(() => {
    if (state.tag !== "Lobby") return;
    if (state.wind.status !== "loading") return;

    const course = state.course;

    // Initialize SphereView
    if (sphereNodeRef.current && !sphereViewRef.current) {
      sphereViewRef.current = new SphereView(sphereNodeRef.current, course);
      sphereViewRef.current.render();
    }

    // Initialize land collision data
    initLandData();

    // Load wind rasters
    const loadWind = async () => {
      try {
        const [currentWindSource, nextWindSources] = currentWindContext(
          course.startTime,
          null,
          state.windRasterSources,
        );

        // Load wind rasters (await all for initial load)
        await interpolatedWindRef.current.update(
          currentWindSource,
          nextWindSources,
          true, // awaitAll
        );

        // Update visualization
        const factor = interpolatedWindRef.current.getInterpolationFactor(
          course.startTime,
        );
        sphereViewRef.current?.updateWind(interpolatedWindRef.current, factor);

        dispatch({
          type: "WIND_LOAD_RESULT",
          result: { status: "success", data: undefined },
        });
      } catch (e) {
        dispatch({
          type: "WIND_LOAD_RESULT",
          result: {
            status: "error",
            error: e instanceof Error ? e.message : "Failed to load wind data",
          },
        });
      }
    };

    loadWind();
  }, [
    state.tag === "Lobby" ? state.course.key : null,
    state.tag === "Lobby" ? state.wind.status : null,
  ]);

  // Transition to Playing when countdown is over
  useEffect(() => {
    if (state.tag !== "Countdown") return;
    if (state.countdown > 0) return;

    dispatch({ type: "START_PLAYING" });

    // Query wind immediately at start position so first frame has correct speed
    const wind = interpolatedWindRef.current.speedAt(
      state.course.start,
      state.course.startTime,
    );
    if (wind) {
      dispatch({ type: "LOCAL_WIND_UPDATED", windSpeed: wind });
    }
  }, [state.tag === "Countdown" ? state.countdown : false]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      sphereViewRef.current?.resize();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Update interpolated wind when raster sources change
  useEffect(() => {
    if (state.tag !== "Playing") return;

    const { currentSource, nextSources, courseTime } = state.session;
    const interpolatedWind = interpolatedWindRef.current;

    interpolatedWind.update(currentSource, nextSources).then(() => {
      if (sphereViewRef.current) {
        const factor = interpolatedWind.getInterpolationFactor(courseTime);
        sphereViewRef.current.updateWind(interpolatedWind, factor);
      }
    });
  }, [
    state.tag === "Playing" ? state.session.currentSource?.time : null,
    state.tag === "Playing" ? state.session.nextSources[0]?.time : null,
  ]);

  // Update recorded ghost positions based on courseTime
  useEffect(() => {
    if (state.tag !== "Playing" || recordedGhosts.size === 0) return;
    if (!sphereViewRef.current) return;

    const courseTime = state.session.courseTime;
    const ghostPositions = new Map<
      number,
      { name: string; lng: number; lat: number; heading: number }
    >();

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
  }, [
    state.tag === "Playing" ? state.session.courseTime : null,
    recordedGhosts,
  ]);

  // Show recorded ghosts at start position in lobby
  useEffect(() => {
    if (state.tag !== "Lobby" || state.wind.status !== "success") return;
    if (recordedGhosts.size === 0 || !sphereViewRef.current) return;

    const ghostPositions = new Map<
      number,
      { name: string; lng: number; lat: number; heading: number }
    >();

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
  }, [
    state.tag,
    state.tag === "Lobby" ? state.wind.status : null,
    recordedGhosts,
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

    // Compute and update projected path
    const projectedPath = computeProjectedPath(
      state.session.position,
      state.session.heading,
      state.session.boatSpeed,
      state.session.courseTime,
      interpolatedWind,
    );
    sphereViewRef.current.updateProjectedPath(projectedPath);
  }, [
    state.tag === "Playing" ? state.session.position : null,
    state.tag === "Playing" ? state.session.heading : null,
    state.tag === "Playing" ? state.session.courseTime : null,
    state.tag === "Playing" ? state.session.lockedTWA : null,
    state.tag === "Playing" ? state.session.targetHeading : null,
  ]);

  return (
    <>
      <div ref={sphereNodeRef} id="sphere" className="fixed inset-0" />
      <div id="app" className="fixed inset-0 z-10 pointer-events-none">
        {(state.tag === "Idle" || state.tag === "Lobby") &&
          courses.length > 0 && (
            <div className="pointer-events-auto">
              <RaceContext.Provider value={raceContextValue}>
                <RaceChoiceScreen />
              </RaceContext.Provider>
            </div>
          )}
        {state.tag === "Countdown" && (
          <>
            <div className="fixed inset-0 flex flex-col items-center justify-center bg-black bg-opacity-10">
              <div className="bg-slate-900 bg-opacity-90 rounded-lg p-8 max-w-md w-full mx-4 space-y-6">
                <CountdownDisplay countdown={state.countdown} />
              </div>
            </div>
            <button
              onClick={handleQuitClick}
              className="fixed bottom-4 left-4 px-4 py-2 text-slate-400 hover:text-white text-sm transition-all pointer-events-auto"
            >
              Cancel
            </button>
          </>
        )}
        {state.tag === "Playing" && (
          <>
            <Hud session={state.session} />
            <Leaderboard
              entries={state.leaderboard}
              myPlayerId={state.race.myPlayerId}
              courseStartTime={state.session.course.startTime}
            />
            <PolarDiagram
              tws={getWindSpeedKnots(state.session.windSpeed)}
              twa={calculateTWA(
                state.session.heading,
                getWindDirection(state.session.windSpeed),
              )}
              bsp={state.session.boatSpeed}
            />
            {state.session.finishTime !== null ? (
              <FinishOverlay
                finishTime={state.session.finishTime}
                courseStartTime={state.session.course.startTime}
                onBack={handleQuitRace}
              />
            ) : (
              <button
                onClick={handleQuitClick}
                className="fixed top-4 left-4 px-4 py-2 bg-black/60 hover:bg-black/80 text-slate-300 hover:text-white text-sm rounded-lg transition-all pointer-events-auto"
              >
                Abandon
              </button>
            )}
          </>
        )}
      </div>
      <CursorWind
        sphereView={sphereViewRef.current}
        courseTime={state.tag === "Playing" ? state.session.courseTime : 0}
      />
      {showQuitConfirm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 pointer-events-auto">
          <div className="bg-slate-900 rounded-lg p-6 max-w-sm w-full mx-4">
            <h2 className="text-white text-lg font-semibold mb-4">
              Abandon this race?
            </h2>
            <div className="flex gap-3">
              <button
                onClick={() => setShowQuitConfirm(false)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleQuitRace}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all"
              >
                Abandon
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

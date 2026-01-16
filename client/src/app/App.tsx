import { useReducer, useEffect, useRef, useState, useCallback } from "react";
import { appReducer, initialState } from "./state";
import { SphereView } from "../sphere";
import InterpolatedWind from "../interpolated-wind";
import { Course, WindReport } from "../models";
import Hud from "./Hud";
import CursorWind from "./CursorWind";
import Leaderboard from "./Leaderboard";
import { initLandData } from "./land";
import RaceScreen from "./RaceScreen";
import { useKeyboardControls, useGameLoop, useMultiplayer } from "./hooks";
import { computeProjectedPath } from "./projected-path";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseKey, setSelectedCourseKey] = useState<string | null>(
    null,
  );

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
  const reportsRef = useRef<WindReport[] | null>(null);

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
    if (!state.reportsLoaded || !state.race.raceStarted) return;
    if (!reportsRef.current) return;

    dispatch({ type: "START_PLAYING", reports: reportsRef.current });
  }, [
    state.tag === "Loading" ? state.reportsLoaded : false,
    state.tag === "Loading" ? state.race.raceStarted : false,
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
    state.tag === "Playing" ? state.session.currentReport?.time : null,
    state.tag === "Playing" ? state.session.nextReports[0]?.time : null,
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
      state.session.lockedTWA,
      state.session.targetHeading,
      state.session.courseTime,
      state.session.course.timeFactor,
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
        {(state.tag === "Idle" || state.tag === "Loading") &&
          courses.length > 0 && (
            <div className="pointer-events-auto">
              <RaceScreen
                raceId={state.tag === "Loading" ? state.race.id : null}
                myPlayerId={
                  state.tag === "Loading" ? state.race.myPlayerId : null
                }
                isCreator={
                  state.tag === "Loading" ? state.race.isCreator : false
                }
                players={
                  state.tag === "Loading" ? state.race.players : new Map()
                }
                countdown={
                  state.tag === "Loading" ? state.race.countdown : null
                }
                courses={courses}
                selectedCourseKey={selectedCourseKey}
                onCourseChange={handleCourseChange}
                onCreateRace={multiplayerCallbacks.onCreateRace}
                onJoinRace={multiplayerCallbacks.onJoinRace}
                onStartRace={multiplayerCallbacks.onStartRace}
                onLeaveRace={multiplayerCallbacks.onLeaveRace}
              />
            </div>
          )}
        {state.tag === "Playing" && (
          <>
            <Hud session={state.session} />
            <Leaderboard
              entries={state.leaderboard}
              myPlayerId={state.race.myPlayerId}
            />
          </>
        )}
      </div>
      <CursorWind
        sphereView={sphereViewRef.current}
        courseTime={state.tag === "Playing" ? state.session.courseTime : 0}
      />
    </>
  );
}

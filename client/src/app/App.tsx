import { useReducer, useEffect, useState, useCallback, useMemo } from "react";
import { appReducer, initialState } from "./state";
import Hud from "./Hud";
import CursorWind from "./CursorWind";
import Leaderboard from "./Leaderboard";
import PolarDiagram from "./PolarDiagram";
import RaceChoiceScreen from "./RaceChoiceScreen";
import CourseEditor from "./CourseEditor";
import { loadAccount, type Account } from "./account";
import {
  useKeyboardControls,
  useGameLoop,
  useMultiplayer,
  useCourses,
  useGhosts,
  useSphereView,
  useRaceDataLoader,
  useWindSourceUpdater,
  useSessionRefs,
  useIdleWind,
} from "./hooks";
import { CountdownDisplay } from "./race";
import { calculateTWA } from "./polar";
import { getWindDirection, getWindSpeedKnots } from "../utils";
import FinishOverlay from "./FinishOverlay";
import KeyBindings from "./KeyBindings";
import { RaceContext, RaceContextValue } from "./race-context";

// Re-export for backward compatibility
export type { RecordedGhost } from "./hooks/useGhosts";

type View = "race" | "editor";

export default function App() {
  const [view, setView] = useState<View>("race");
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [editorAccount, setEditorAccount] = useState<Account | null>(null);

  // Courses management
  const {
    courses,
    selectedCourseKey,
    setSelectedCourseKey,
    coursesRef,
    selectedCourseRef,
    refreshCourses,
  } = useCourses();

  // Derive session-related values
  const session = state.tag === "Playing" ? state.session : null;
  const lobbyCourse = state.tag === "Lobby" ? state.course : null;

  // SphereView management
  const { sphereViewRef, sphereNodeRef, interpolatedWindRef, vmgBad, resetWind } =
    useSphereView(session, lobbyCourse);

  // Load random wind for idle globe view (before any race is created)
  const isIdleWithoutRace = state.tag === "Idle";
  useIdleWind(isIdleWithoutRace, sphereViewRef, interpolatedWindRef);

  // Sync selected course to SphereView and focus viewport
  useEffect(() => {
    if (selectedCourseKey && sphereViewRef.current && coursesRef.current) {
      const course = coursesRef.current.get(selectedCourseKey);
      if (course) {
        sphereViewRef.current.setCourse(course);
        // Focus on start + first gate when selecting a course in idle state
        if (state.tag === "Idle") {
          sphereViewRef.current.focusOnCourseStart();
        }
      }
    }
  }, [selectedCourseKey, coursesRef, sphereViewRef, state.tag]);

  // Ghost replays
  const courseTime = session?.courseTime ?? null;
  const isLobbyReady = state.tag === "Lobby" && state.wind.status === "success";
  const { recordedGhosts, addGhost, removeGhost } = useGhosts(
    sphereViewRef,
    courseTime,
    isLobbyReady,
  );

  // Multiplayer
  const [multiplayerRef, multiplayerCallbacks] = useMultiplayer(
    dispatch,
    sphereViewRef,
    selectedCourseRef,
    coursesRef,
  );

  // Race data loading (lobby)
  useRaceDataLoader(
    state.tag === "Lobby" && state.wind.status === "loading",
    lobbyCourse,
    state.tag === "Lobby" ? state.windRasterSources : null,
    sphereNodeRef,
    sphereViewRef,
    interpolatedWindRef,
    dispatch,
  );

  // Wind source updates (playing)
  useWindSourceUpdater(
    state.tag === "Playing",
    session?.currentSource ?? null,
    session?.nextSources ?? [],
    session?.courseTime ?? 0,
    sphereViewRef,
    interpolatedWindRef,
  );

  // Session refs for game loop (avoids re-renders)
  const sessionRefs = useSessionRefs(session);

  // Handle quitting the race
  const handleQuitRace = useCallback(() => {
    if (multiplayerRef.current) {
      multiplayerRef.current.leaveRace();
      multiplayerRef.current.disconnect();
    }
    resetWind();
    dispatch({ type: "LEAVE_RACE" });
    setShowQuitConfirm(false);
  }, [multiplayerRef, resetWind]);

  // Handle quit button click - show confirmation or quit directly
  const handleQuitClick = useCallback(() => {
    const needsConfirm =
      state.tag === "Countdown" ||
      (state.tag === "Playing" && state.session.finishTime === null);

    if (needsConfirm) {
      setShowQuitConfirm(true);
    } else {
      handleQuitRace();
    }
  }, [state, handleQuitRace]);

  // Handle course selection - leave current race if any, just select the course
  const handleSelectCourse = useCallback(
    (courseKey: string) => {
      if (selectedCourseKey === courseKey && state.tag === "Idle") {
        // Already selected and not in race, no-op
        return;
      }

      setSelectedCourseKey(courseKey);

      if (multiplayerRef.current) {
        multiplayerRef.current.leaveRace();
        multiplayerRef.current.disconnect();
      }
      resetWind();
      dispatch({ type: "LEAVE_RACE" });
    },
    [
      selectedCourseKey,
      state.tag,
      setSelectedCourseKey,
      multiplayerRef,
      resetWind,
    ],
  );

  // Keyboard controls
  useKeyboardControls(state.tag === "Playing", dispatch, sphereViewRef);

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

  // Game loop
  useGameLoop(state.tag === "Playing", session, dispatch, {
    ...sessionRefs,
    interpolatedWind: interpolatedWindRef,
    multiplayer: multiplayerRef,
  });

  // Sync next gate index to SphereView for visualization
  useEffect(() => {
    if (session && sphereViewRef.current) {
      sphereViewRef.current.setNextGateIndex(session.nextGateIndex);
    }
  }, [session?.nextGateIndex, sphereViewRef]);

  // Transition to Playing when countdown reaches 0
  useEffect(() => {
    if (state.tag !== "Countdown") return;
    if (state.countdown > 0) return;

    dispatch({ type: "START_PLAYING" });

    if (interpolatedWindRef.current) {
      const wind = interpolatedWindRef.current.speedAt(
        state.course.start,
        state.course.startTime,
      );
      if (wind) {
        dispatch({ type: "LOCAL_WIND_UPDATED", windSpeed: wind });
      }
    }
  }, [state.tag === "Countdown" ? state.countdown : false]);

  const handleOpenEditor = useCallback(() => {
    const account = loadAccount();
    setEditorAccount(account);
    setView("editor");
  }, []);

  const handleCloseEditor = useCallback(() => {
    refreshCourses();
    setView("race");
  }, [refreshCourses]);

  // Build the race context value
  const raceContextValue = useMemo<RaceContextValue>(
    () => ({
      raceId: state.tag === "Lobby" ? state.race.id : null,
      myPlayerId: state.tag === "Lobby" ? state.race.myPlayerId : null,
      isCreator: state.tag === "Lobby" ? state.race.isCreator : false,
      canSelectCourse:
        state.tag === "Idle" || (state.tag === "Lobby" && state.race.isCreator),
      players: state.tag === "Lobby" ? state.race.players : new Map(),
      windStatus: state.tag === "Lobby" ? state.wind.status : "idle",
      courses,
      selectedCourseKey,
      recordedGhosts,
      createRace: multiplayerCallbacks.onCreateRace,
      joinRace: multiplayerCallbacks.onJoinRace,
      startRace: multiplayerCallbacks.onStartRace,
      leaveRace: multiplayerCallbacks.onLeaveRace,
      selectCourse: handleSelectCourse,
      openEditor: handleOpenEditor,
      addGhost,
      removeGhost,
    }),
    [
      state,
      courses,
      selectedCourseKey,
      recordedGhosts,
      multiplayerCallbacks,
      handleSelectCourse,
      handleOpenEditor,
      addGhost,
      removeGhost,
    ],
  );

  if (view === "editor") {
    if (!editorAccount) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 w-80 text-center">
            <p className="text-slate-300 mb-4">Please sign in to access the editor.</p>
            <button
              onClick={handleCloseEditor}
              className="text-sm text-slate-400 hover:text-white py-2 px-4 border border-slate-700 rounded transition-all"
            >
              Back
            </button>
          </div>
        </div>
      );
    }
    return (
      <CourseEditor
        account={editorAccount}
        onBack={handleCloseEditor}
        onUnauthorized={handleCloseEditor}
      />
    );
  }

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
            <div className="fixed bottom-16 inset-x-0 flex justify-center pointer-events-none">
              <CountdownDisplay countdown={state.countdown} />
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
            <KeyBindings />
            <Leaderboard
              entries={state.leaderboard}
              myPlayerId={state.race.myPlayerId}
              courseStartTime={state.session.course.startTime}
              onQuit={handleQuitClick}
            />
            <PolarDiagram
              polar={state.session.polar}
              tws={getWindSpeedKnots(state.session.windSpeed)}
              twa={calculateTWA(
                state.session.heading,
                getWindDirection(state.session.windSpeed),
              )}
              bsp={state.session.boatSpeed}
              vmgBad={vmgBad}
              twaLocked={state.session.lockedTWA !== null}
            />
            {state.session.finishTime !== null && (
              <FinishOverlay
                finishTime={state.session.finishTime}
                courseStartTime={state.session.course.startTime}
                onBack={handleQuitRace}
              />
            )}
          </>
        )}
      </div>
      <CursorWind
        sphereView={sphereViewRef.current}
        courseTime={session?.courseTime ?? 0}
      />
      {showQuitConfirm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 pointer-events-auto">
          <div className="bg-slate-900 rounded-lg p-6 max-w-sm w-full mx-4">
            <h2 className="text-white text-lg font-semibold mb-4">
              Quit this race?
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
                Quit race
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

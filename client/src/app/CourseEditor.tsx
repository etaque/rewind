import { useState, useEffect, useCallback, useRef } from "react";
import { Course } from "../models";
import { type AsyncState, asyncState } from "./state";
import {
  fetchCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  verifyPassword,
} from "./editor/api";
import CourseForm, { type FocusTarget } from "./editor/CourseForm";
import EditorMap, { type MapSelection } from "./editor/EditorMap";

const emptyCourse: Course = {
  key: "",
  name: "",
  description: "",
  polar: "vr-imoca-full-pack",
  startTime: Date.now(),
  start: { lng: 0, lat: 0 },
  startHeading: 0,
  finishLine: { center: { lng: 0, lat: 0 }, orientation: 0, lengthNm: 24 },
  gates: [],
  routeWaypoints: [[]],
  timeFactor: 2000,
  maxDays: 30,
};

type Props = {
  onBack: () => void;
};

export default function CourseEditor({ onBack }: Props) {
  const [password, setPassword] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saveState, setSaveState] = useState<AsyncState<void>>(asyncState.idle());
  const [focusTarget, setFocusTarget] = useState<FocusTarget>(null);
  const focusKeyRef = useRef(0);

  const loadCourses = useCallback(async () => {
    try {
      const data = await fetchCourses();
      setCourses(data);
    } catch (err) {
      console.error("Failed to load courses:", err);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const handleSelectCourse = useCallback(
    (key: string) => {
      const course = courses.find((c) => c.key === key);
      if (course) {
        setSelectedKey(key);
        setEditCourse({ ...course });
        setIsNew(false);
        setSaveState(asyncState.idle());
      }
    },
    [courses],
  );

  const handleNewCourse = useCallback(() => {
    setSelectedKey(null);
    setEditCourse({ ...emptyCourse });
    setIsNew(true);
    setSaveState(asyncState.idle());
  }, []);

  const handleSave = useCallback(async () => {
    if (!editCourse || !password) return;
    setSaveState(asyncState.loading());
    try {
      if (isNew) {
        await createCourse(editCourse, password);
        setIsNew(false);
        setSelectedKey(editCourse.key);
      } else {
        await updateCourse(selectedKey!, editCourse, password);
      }
      await loadCourses();
      setSaveState(asyncState.success(undefined));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      if (message === "Invalid password") setPassword(null);
      setSaveState(asyncState.error(message));
    }
  }, [editCourse, isNew, selectedKey, password, loadCourses]);

  const handleDelete = useCallback(async () => {
    if (!selectedKey || !password) return;
    if (!confirm(`Delete course "${selectedKey}"?`)) return;
    try {
      await deleteCourse(selectedKey, password);
      setSelectedKey(null);
      setEditCourse(null);
      await loadCourses();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      if (message === "Invalid password") setPassword(null);
      setSaveState(asyncState.error(message));
    }
  }, [selectedKey, password, loadCourses]);

  const handleAddGate = useCallback(() => {
    if (!editCourse) return;
    const gates = [
      ...editCourse.gates,
      { center: { ...editCourse.start }, orientation: 0, lengthNm: 24 },
    ];
    // Add a new leg for waypoints (N gates = N+1 legs)
    const routeWaypoints = [...editCourse.routeWaypoints, []];
    setEditCourse({ ...editCourse, gates, routeWaypoints });
  }, [editCourse]);

  const handleRemoveGate = useCallback(
    (index: number) => {
      if (!editCourse) return;
      const gates = editCourse.gates.filter((_, i) => i !== index);
      // Remove the leg after this gate and merge waypoints into the previous leg
      const routeWaypoints = editCourse.routeWaypoints.filter(
        (_, i) => i !== index + 1,
      );
      setEditCourse({ ...editCourse, gates, routeWaypoints });
    },
    [editCourse],
  );

  const handleMapSelect = useCallback((selection: MapSelection) => {
    setFocusTarget({ selection, key: ++focusKeyRef.current });
  }, []);

  if (password === null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!passwordInput || verifying) return;
            setVerifying(true);
            setPasswordError(null);
            const ok = await verifyPassword(passwordInput);
            setVerifying(false);
            if (ok) {
              setPassword(passwordInput);
            } else {
              setPasswordError("Invalid password");
            }
          }}
          className="bg-slate-900 border border-slate-800 rounded-lg p-6 w-80"
        >
          <h2 className="text-white font-semibold mb-4">Editor Password</h2>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => {
              setPasswordInput(e.target.value);
              setPasswordError(null);
            }}
            placeholder="Enter password"
            autoFocus
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm mb-4 focus:outline-none focus:border-blue-500"
          />
          {passwordError && (
            <p className="text-red-400 text-sm mb-3">{passwordError}</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 text-sm text-slate-400 hover:text-white py-2 border border-slate-700 rounded transition-all"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={!passwordInput || verifying}
              className="flex-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2 rounded transition-all"
            >
              {verifying ? "Verifying..." : "Enter"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex bg-slate-950">
      {/* Left panel */}
      <div className="w-[350px] flex flex-col border-r border-slate-800 bg-slate-900">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h1 className="text-white font-semibold">Course Editor</h1>
          <button
            onClick={onBack}
            className="text-sm text-slate-400 hover:text-white transition-all"
          >
            Back to Race
          </button>
        </div>

        {/* Course list */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-slate-400 text-xs uppercase tracking-wide">
              Courses
            </h2>
            <button
              onClick={handleNewCourse}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              + New Course
            </button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {courses.map((course) => (
              <button
                key={course.key}
                onClick={() => handleSelectCourse(course.key)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-all flex items-center justify-between ${
                  selectedKey === course.key
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <span>{course.name || course.key}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Course form */}
        <div className="flex-1 overflow-y-auto p-4">
          {editCourse ? (
            <>
              <CourseForm
                course={editCourse}
                isNew={isNew}
                onChange={setEditCourse}
                onSave={handleSave}
                onAddGate={handleAddGate}
                onRemoveGate={handleRemoveGate}
                saveState={saveState}
                focusTarget={focusTarget}
                onSelect={handleMapSelect}
              />
              {!isNew && selectedKey && (
                <button
                  onClick={handleDelete}
                  className="w-full mt-3 text-red-400 hover:text-red-300 py-2 text-sm transition-all border border-red-900 hover:border-red-700 rounded"
                >
                  Delete Course
                </button>
              )}
            </>
          ) : (
            <div className="text-slate-500 text-sm">
              Select a course or create a new one.
            </div>
          )}
        </div>
      </div>

      {/* Map area */}
      <div className="flex-1">
        {editCourse ? (
          <EditorMap course={editCourse} onChange={setEditCourse} onSelect={handleMapSelect} focusTarget={focusTarget} />
        ) : (
          <div className="h-full flex items-center justify-center text-slate-600">
            Select a course to view on the map
          </div>
        )}
      </div>
    </div>
  );
}

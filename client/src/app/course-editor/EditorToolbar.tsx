import { useState } from "react";
import { Course } from "../../models";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

type Props = {
  course: Course | null;
  onCourseLoaded: (course: Course) => void;
};

const emptyCourse: Course = {
  key: "",
  name: "New Course",
  description: "",
  polar: "imoca60",
  startTime: Date.now(),
  start: { lng: -1.15, lat: 46.13 },
  startHeading: 180,
  finishLine: {
    center: { lng: -1.15, lat: 46.13 },
    orientation: 90,
    lengthNm: 5,
  },
  gates: [],
  exclusionZones: [],
  routeWaypoints: [[]],
  timeFactor: 2000,
  maxDays: 90,
};

export default function EditorToolbar({ course, onCourseLoaded }: Props) {
  const [serverCourses, setServerCourses] = useState<Course[] | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleNew = () => {
    onCourseLoaded({ ...emptyCourse, startTime: Date.now() });
  };

  const handleLoadFromServer = async () => {
    if (serverCourses) {
      setShowDropdown(!showDropdown);
      return;
    }
    try {
      const res = await fetch(`${serverUrl}/courses`);
      const courses: Course[] = await res.json();
      setServerCourses(courses);
      setShowDropdown(true);
    } catch (err) {
      console.error("Failed to fetch courses:", err);
    }
  };

  const handlePickServerCourse = (c: Course) => {
    onCourseLoaded(c);
    setShowDropdown(false);
  };

  const handleLoadJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      file.text().then((text) => {
        const parsed = JSON.parse(text) as Course;
        onCourseLoaded(parsed);
      });
    };
    input.click();
  };

  const handleExport = () => {
    if (!course) return;
    const json = JSON.stringify(course, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${course.key || "course"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const btnClass =
    "px-3 py-1.5 text-xs rounded-lg transition-all";
  const activeBtnClass = `${btnClass} bg-slate-700 hover:bg-slate-600 text-slate-300`;
  const disabledBtnClass = `${btnClass} bg-slate-800 text-slate-600 cursor-not-allowed`;

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={handleNew} className={activeBtnClass}>
          New
        </button>
        <div className="relative">
          <button type="button" onClick={handleLoadFromServer} className={activeBtnClass}>
            Load from server
          </button>
          {showDropdown && serverCourses && (
            <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-20 min-w-[200px]">
              {serverCourses.map((c) => (
                <button
                  key={c.key}
                  onClick={() => handlePickServerCourse(c)}
                  className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 first:rounded-t-lg last:rounded-b-lg"
                >
                  {c.name}
                </button>
              ))}
              {serverCourses.length === 0 && (
                <div className="px-3 py-2 text-sm text-slate-500">No courses</div>
              )}
            </div>
          )}
        </div>
        <button type="button" onClick={handleLoadJson} className={activeBtnClass}>
          Load JSON
        </button>
        <button
          type="button"
          onClick={handleExport}
          className={course ? activeBtnClass : disabledBtnClass}
          disabled={!course}
        >
          Export JSON
        </button>
      </div>
    </div>
  );
}

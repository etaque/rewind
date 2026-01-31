import { useState, useEffect, useRef, useCallback } from "react";
import { Course } from "../../models";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

export type CoursesState = {
  courses: Course[];
  selectedCourseKey: string | null;
  setSelectedCourseKey: (key: string) => void;
  coursesRef: React.MutableRefObject<Map<string, Course>>;
  selectedCourseRef: React.MutableRefObject<Course | null>;
  refreshCourses: () => void;
};

function fetchAndSetCourses(
  coursesRef: React.MutableRefObject<Map<string, Course>>,
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>,
) {
  fetch(`${serverUrl}/courses`)
    .then((res) => res.json())
    .then((fetchedCourses: Course[]) => {
      const courseMap = new Map<string, Course>();
      fetchedCourses.forEach((c) => courseMap.set(c.key, c));
      coursesRef.current = courseMap;
      setCourses(fetchedCourses);
    })
    .catch((err) => {
      console.error("Failed to fetch courses:", err);
    });
}

/**
 * Hook to fetch and manage available courses.
 * Returns the list of courses, selection state, and refs for multiplayer.
 */
export function useCourses(): CoursesState {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseKey, setSelectedCourseKey] = useState<string | null>(
    null,
  );
  const coursesRef = useRef<Map<string, Course>>(new Map());
  const selectedCourseRef = useRef<Course | null>(null);

  // Fetch courses on startup
  useEffect(() => {
    fetchAndSetCourses(coursesRef, setCourses);
  }, []);

  const refreshCourses = useCallback(() => {
    fetchAndSetCourses(coursesRef, setCourses);
  }, []);

  // Sync selectedCourseRef when selectedCourseKey changes
  useEffect(() => {
    if (selectedCourseKey) {
      const course = coursesRef.current.get(selectedCourseKey) || null;
      selectedCourseRef.current = course;
    }
  }, [selectedCourseKey]);

  return {
    courses,
    selectedCourseKey,
    setSelectedCourseKey,
    coursesRef,
    selectedCourseRef,
    refreshCourses,
  };
}

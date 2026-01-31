import { Course } from "../../models";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

export async function fetchCourses(): Promise<Course[]> {
  const res = await fetch(`${serverUrl}/courses`);
  if (!res.ok) throw new Error("Failed to fetch courses");
  return res.json();
}

export async function createCourse(course: Course): Promise<void> {
  const res = await fetch(`${serverUrl}/courses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(course),
  });
  if (!res.ok) throw new Error("Failed to create course");
}

export async function updateCourse(
  key: string,
  course: Course,
): Promise<void> {
  const res = await fetch(`${serverUrl}/courses/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(course),
  });
  if (!res.ok) throw new Error("Failed to update course");
}

export async function deleteCourse(key: string): Promise<void> {
  const res = await fetch(`${serverUrl}/courses/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete course");
}

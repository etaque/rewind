import { Course } from "../../models";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

export async function verifyPassword(password: string): Promise<boolean> {
  const res = await fetch(`${serverUrl}/editor/verify`, {
    headers: { "X-Editor-Password": password },
  });
  return res.ok;
}

export async function fetchCourses(): Promise<Course[]> {
  const res = await fetch(`${serverUrl}/courses`);
  if (!res.ok) throw new Error("Failed to fetch courses");
  return res.json();
}

export async function createCourse(
  course: Course,
  password: string,
): Promise<void> {
  const res = await fetch(`${serverUrl}/courses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Editor-Password": password,
    },
    body: JSON.stringify(course),
  });
  if (res.status === 401) throw new Error("Invalid password");
  if (!res.ok) throw new Error("Failed to create course");
}

export async function updateCourse(
  key: string,
  course: Course,
  password: string,
): Promise<void> {
  const res = await fetch(`${serverUrl}/courses/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Editor-Password": password,
    },
    body: JSON.stringify(course),
  });
  if (res.status === 401) throw new Error("Invalid password");
  if (!res.ok) throw new Error("Failed to update course");
}

export async function deleteCourse(
  key: string,
  password: string,
): Promise<void> {
  const res = await fetch(`${serverUrl}/courses/${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: { "X-Editor-Password": password },
  });
  if (res.status === 401) throw new Error("Invalid password");
  if (!res.ok) throw new Error("Failed to delete course");
}

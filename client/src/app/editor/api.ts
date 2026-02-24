import { Course } from "../../models";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

function authHeaders(sessionToken: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionToken}`,
  };
}

export async function verifyEditorAccess(
  sessionToken: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch(`${serverUrl}/editor/verify`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
    signal,
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
  sessionToken: string,
): Promise<void> {
  const res = await fetch(`${serverUrl}/courses`, {
    method: "POST",
    headers: authHeaders(sessionToken),
    body: JSON.stringify(course),
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to create course");
}

export async function updateCourse(
  key: string,
  course: Course,
  sessionToken: string,
): Promise<void> {
  const res = await fetch(`${serverUrl}/courses/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: authHeaders(sessionToken),
    body: JSON.stringify(course),
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to update course");
}

export async function deleteCourse(
  key: string,
  sessionToken: string,
): Promise<void> {
  const res = await fetch(`${serverUrl}/courses/${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to delete course");
}

export async function reorderCourses(
  keys: string[],
  sessionToken: string,
): Promise<void> {
  const res = await fetch(`${serverUrl}/courses/reorder`, {
    method: "PUT",
    headers: authHeaders(sessionToken),
    body: JSON.stringify(keys),
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to reorder courses");
}

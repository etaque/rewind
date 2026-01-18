import { WindRasterSource } from "../models";

export function currentWindContext(
  courseTime: number,
  currentSource: WindRasterSource | null,
  nextSources: WindRasterSource[],
): [WindRasterSource | null, WindRasterSource[]] {
  if (!nextSources.length) {
    return [currentSource, []];
  }

  // If courseTime is before all sources, use the first source as current
  // (fallback to ensure we always have a valid wind raster)
  if (courseTime < nextSources[0].time) {
    const fallback = currentSource ?? nextSources[0];
    const remaining = currentSource ? nextSources : nextSources.slice(1);
    return [fallback, remaining];
  }

  const i = nextSources.findIndex((r) => r.time > courseTime);
  if (i > 0) {
    return [nextSources[i - 1], nextSources.slice(i)];
  }

  // If courseTime is after all sources, use the last one
  if (i === -1 && nextSources.length > 0) {
    return [nextSources[nextSources.length - 1], []];
  }

  return [currentSource, nextSources];
}

import { WindReport } from "../models";

export function refreshWindReport(
  courseTime: number,
  currentReport: WindReport | null,
  nextReports: WindReport[],
): [WindReport | null, WindReport[]] {
  if (!nextReports.length) {
    return [currentReport, []];
  }

  // If courseTime is before all reports, use the first report as current
  // (fallback to ensure we always have a valid wind raster)
  if (courseTime < nextReports[0].time) {
    const fallback = currentReport ?? nextReports[0];
    const remaining = currentReport ? nextReports : nextReports.slice(1);
    return [fallback, remaining];
  }

  const i = nextReports.findIndex((r) => r.time > courseTime);
  if (i > 0) {
    return [nextReports[i - 1], nextReports.slice(i)];
  }

  // If courseTime is after all reports, use the last one
  if (i === -1 && nextReports.length > 0) {
    return [nextReports[nextReports.length - 1], []];
  }

  return [currentReport, nextReports];
}

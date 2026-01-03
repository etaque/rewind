import { WindReport } from "../models";

export function refreshWindReport(
  courseTime: number,
  currentReport: WindReport | null,
  nextReports: WindReport[],
): [WindReport | null, WindReport[]] {
  if (!nextReports.length) {
    return [currentReport, []];
  }

  if (courseTime < nextReports[0].time) {
    return [currentReport, nextReports];
  }

  const i = nextReports.findIndex((r) => r.time > courseTime);
  if (i > 0) {
    return [nextReports[i - 1], nextReports.slice(i)];
  }

  return [currentReport, nextReports];
}

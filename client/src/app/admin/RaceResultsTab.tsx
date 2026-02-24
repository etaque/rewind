import { useState, useEffect, useCallback } from "react";
import { fetchResults, deleteResult, type AdminRaceResult } from "./api";
import { Course } from "../../models";
import { formatDuration } from "../../utils";
import ResultTraceMap from "./ResultTraceMap";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

type Props = {
  sessionToken: string;
  onUnauthorized: () => void;
};

const PAGE_SIZE = 50;

export default function RaceResultsTab({ sessionToken, onUnauthorized }: Props) {
  const [results, setResults] = useState<AdminRaceResult[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courseFilter, setCourseFilter] = useState<string>("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);

  // Load courses for filter dropdown
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${serverUrl}/courses`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCourses(data);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to load courses:", err);
      });
    return () => controller.abort();
  }, []);

  const load = useCallback(async (off: number, course: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchResults(
        sessionToken,
        PAGE_SIZE,
        off,
        course || undefined,
      );
      setResults(data.results);
      setTotal(data.total);
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, onUnauthorized]);

  useEffect(() => {
    load(offset, courseFilter);
  }, [offset, courseFilter, load]);

  const handleDelete = useCallback(async (result: AdminRaceResult) => {
    if (!confirm(`Delete result by "${result.playerName}" on ${result.courseKey}?`)) return;
    try {
      await deleteResult(sessionToken, result.id);
      if (selectedResultId === result.id) setSelectedResultId(null);
      load(offset, courseFilter);
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }, [sessionToken, offset, courseFilter, selectedResultId, load, onUnauthorized]);

  const handleCourseFilterChange = (value: string) => {
    setCourseFilter(value);
    setOffset(0);
  };

  const hasNext = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  return (
    <div className="flex h-full">
      {/* Left: results list */}
      <div className="w-1/2 flex flex-col border-r border-slate-800 overflow-hidden">
        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Race Results ({total})</h2>
            <select
              value={courseFilter}
              onChange={(e) => handleCourseFilterChange(e.target.value)}
              className="bg-slate-800 text-slate-300 text-xs border border-slate-700 rounded px-2 py-1"
            >
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c.key} value={c.key}>{c.name}</option>
              ))}
            </select>
          </div>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 py-4">
              <span className="w-4 h-4 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
              Loading...
            </div>
          ) : (
            <>
              <div className="space-y-1">
                {results.map((result) => (
                  <div
                    key={result.id}
                    onClick={() => setSelectedResultId(result.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-all text-sm ${
                      selectedResultId === result.id
                        ? "bg-blue-600/20 border border-blue-500/30"
                        : "bg-slate-800 hover:bg-slate-700/50 border border-transparent"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white truncate">{result.playerName}</span>
                        <span className="text-slate-500 text-xs">{result.courseKey}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                        <span className="text-green-400 font-mono">
                          {formatDuration(result.finishTime)}
                        </span>
                        <span>
                          {new Date(result.raceStartTime).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(result);
                      }}
                      className="text-red-400 hover:text-red-300 text-xs ml-2 transition-all"
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {results.length === 0 && (
                  <div className="py-4 text-center text-slate-500 text-sm">
                    No results found.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-sm pt-2">
                <span className="text-slate-500 text-xs">
                  {total > 0 ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}` : "0 results"}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    disabled={!hasPrev}
                    className="px-2 py-1 text-slate-400 hover:text-white border border-slate-700 rounded text-xs disabled:opacity-30 disabled:hover:text-slate-400 transition-all"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                    disabled={!hasNext}
                    className="px-2 py-1 text-slate-400 hover:text-white border border-slate-700 rounded text-xs disabled:opacity-30 disabled:hover:text-slate-400 transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: trace map */}
      <div className="w-1/2 bg-slate-950">
        {selectedResultId ? (
          <ResultTraceMap resultId={selectedResultId} />
        ) : (
          <div className="h-full flex items-center justify-center text-slate-600 text-sm">
            Select a result to view its trace
          </div>
        )}
      </div>
    </div>
  );
}

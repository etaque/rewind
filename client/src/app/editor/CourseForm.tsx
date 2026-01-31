import { useEffect } from "react";
import { Course } from "../../models";
import type { AsyncState } from "../state";
import type { MapSelection } from "./EditorMap";

export type FocusTarget = {
  selection: MapSelection;
  key: number;
} | null;

const ORIENTATION_PRESETS = [
  { label: "N-S", value: 0 },
  { label: "NE-SW", value: 45 },
  { label: "E-W", value: 90 },
  { label: "NW-SE", value: 135 },
];

function OrientationPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {ORIENTATION_PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          className={`px-1.5 py-0.5 rounded text-xs transition-all ${
            value === p.value
              ? "bg-blue-600 text-white"
              : "bg-slate-700 text-slate-400 hover:text-white"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

type Props = {
  course: Course;
  isNew: boolean;
  onChange: (course: Course) => void;
  onSave: () => void;
  onAddGate: () => void;
  onRemoveGate: (index: number) => void;
  saveState: AsyncState<void>;
  focusTarget?: FocusTarget;
  onSelect?: (selection: MapSelection) => void;
};

export default function CourseForm({
  course,
  isNew,
  onChange,
  onSave,
  onAddGate,
  onRemoveGate,
  saveState,
  focusTarget,
  onSelect,
}: Props) {
  const update = (partial: Partial<Course>) => {
    onChange({ ...course, ...partial });
  };

  useEffect(() => {
    if (!focusTarget) return;
    const { selection } = focusTarget;
    let selector: string;
    if (selection.type === "gate") {
      selector = `[data-gate-index="${selection.index}"]`;
    } else if (selection.type === "waypoint") {
      selector = `[data-waypoint-leg="${selection.legIndex}"][data-waypoint-index="${selection.waypointIndex}"]`;
    } else {
      selector = '[data-section="finish"]';
    }
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = el.querySelector<HTMLInputElement>("input");
    if (input) {
      setTimeout(() => input.focus(), 300);
    }
  }, [focusTarget]);

  // Convert unix ms to datetime-local string
  const toDatetimeLocal = (ms: number) => {
    const d = new Date(ms);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const fromDatetimeLocal = (val: string) => new Date(val).getTime();

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-slate-400 text-xs mb-1">Key</label>
        <input
          type="text"
          value={course.key}
          onChange={(e) => update({ key: e.target.value })}
          disabled={!isNew}
          className="w-full bg-slate-800 text-white px-2 py-1.5 rounded border border-slate-700 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-slate-400 text-xs mb-1">Name</label>
        <input
          type="text"
          value={course.name}
          onChange={(e) => update({ name: e.target.value })}
          className="w-full bg-slate-800 text-white px-2 py-1.5 rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-slate-400 text-xs mb-1">
          Description
        </label>
        <textarea
          value={course.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={2}
          className="w-full bg-slate-800 text-white px-2 py-1.5 rounded border border-slate-700 focus:border-blue-500 focus:outline-none resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-slate-400 text-xs mb-1">Polar</label>
          <input
            type="text"
            value={course.polar}
            onChange={(e) => update({ polar: e.target.value })}
            className="w-full bg-slate-800 text-white px-2 py-1.5 rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-slate-400 text-xs mb-1">
            Start Heading
          </label>
          <input
            type="number"
            value={course.startHeading}
            onChange={(e) => update({ startHeading: Number(e.target.value) })}
            className="w-full bg-slate-800 text-white px-2 py-1.5 rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-slate-400 text-xs mb-1">Start Time</label>
        <input
          type="datetime-local"
          value={toDatetimeLocal(course.startTime)}
          onChange={(e) => update({ startTime: fromDatetimeLocal(e.target.value) })}
          className="w-full bg-slate-800 text-white px-2 py-1.5 rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-slate-400 text-xs mb-1">
            Time Factor
          </label>
          <input
            type="number"
            value={course.timeFactor}
            onChange={(e) => update({ timeFactor: Number(e.target.value) })}
            className="w-full bg-slate-800 text-white px-2 py-1.5 rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-slate-400 text-xs mb-1">Max Days</label>
          <input
            type="number"
            value={course.maxDays}
            onChange={(e) => update({ maxDays: Number(e.target.value) })}
            className="w-full bg-slate-800 text-white px-2 py-1.5 rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Start position (read-only, drag on map) */}
      <div>
        <label className="block text-slate-400 text-xs mb-1">
          Start Position (drag on map)
        </label>
        <div className="text-slate-300 text-xs bg-slate-800 px-2 py-1.5 rounded border border-slate-700">
          {course.start.lat.toFixed(4)}, {course.start.lng.toFixed(4)}
        </div>
      </div>

      {/* Finish line */}
      <div
        data-section="finish"
        className={`cursor-pointer rounded ${
          focusTarget?.selection.type === "finish" ? "ring-1 ring-yellow-400" : ""
        }`}
        onClick={() => onSelect?.({ type: "finish" })}
      >
        <label className="block text-slate-400 text-xs mb-1">
          Finish Line (drag on map)
        </label>
        <div className="space-y-1.5">
          <div>
            <label className="block text-slate-500 text-xs mb-0.5">
              Orientation
            </label>
            <OrientationPicker
              value={course.finishLine.orientation}
              onChange={(v) =>
                update({
                  finishLine: { ...course.finishLine, orientation: v },
                })
              }
            />
          </div>
          <div>
            <label className="block text-slate-500 text-xs mb-0.5">
              Length (NM)
            </label>
            <input
              type="number"
              value={course.finishLine.lengthNm}
              onChange={(e) =>
                update({
                  finishLine: {
                    ...course.finishLine,
                    lengthNm: Number(e.target.value),
                  },
                })
              }
              className="w-full bg-slate-800 text-white px-2 py-1 rounded border border-slate-700 focus:border-blue-500 focus:outline-none text-xs"
            />
          </div>
        </div>
      </div>

      {/* Gates */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-slate-400 text-xs">Gates</label>
          <button
            onClick={onAddGate}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            + Add Gate
          </button>
        </div>
        {course.gates.length === 0 && (
          <div className="text-slate-600 text-xs py-1">No gates</div>
        )}
        {course.gates.map((gate, i) => (
          <div
            key={i}
            data-gate-index={i}
            className={`bg-slate-800 rounded px-2 py-1.5 mb-1 space-y-1 cursor-pointer ${
              focusTarget?.selection.type === "gate" && focusTarget.selection.index === i
                ? "ring-1 ring-yellow-400"
                : ""
            }`}
            onClick={() => onSelect?.({ type: "gate", index: i })}
          >
            <div className="flex items-center justify-between">
              <span className="text-blue-400 text-xs">Gate {i + 1}</span>
              <button
                onClick={() => onRemoveGate(i)}
                className="text-red-400 hover:text-red-300 text-xs"
              >
                Remove
              </button>
            </div>
            <OrientationPicker
              value={gate.orientation}
              onChange={(v) => {
                const gates = [...course.gates];
                gates[i] = { ...gates[i], orientation: v };
                update({ gates });
              }}
            />
            <div>
              <label className="text-slate-500 text-xs">Length (NM)</label>
              <input
                type="number"
                value={gate.lengthNm}
                onChange={(e) => {
                  const gates = [...course.gates];
                  gates[i] = {
                    ...gates[i],
                    lengthNm: Number(e.target.value),
                  };
                  update({ gates });
                }}
                className="w-full bg-slate-700 text-white px-1 py-0.5 rounded text-xs"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Route waypoints */}
      {course.routeWaypoints.some((leg) => leg.length > 0) && (
        <div>
          <label className="text-slate-400 text-xs mb-1 block">
            Route Waypoints
          </label>
          {course.routeWaypoints.map((leg, legIndex) => {
            if (leg.length === 0) return null;
            const numGates = course.gates.length;
            const fromLabel =
              legIndex === 0
                ? "Start"
                : `Gate ${legIndex}`;
            const toLabel =
              legIndex < numGates
                ? `Gate ${legIndex + 1}`
                : "Finish";
            return (
              <div key={legIndex} className="mb-1">
                <div className="text-slate-500 text-xs mb-0.5">
                  {fromLabel} → {toLabel}
                </div>
                {leg.map((wp, wpIndex) => (
                  <div
                    key={wpIndex}
                    data-waypoint-leg={legIndex}
                    data-waypoint-index={wpIndex}
                    className={`flex items-center gap-1 bg-slate-800 rounded px-2 py-1 mb-0.5 cursor-pointer ${
                      focusTarget?.selection.type === "waypoint" &&
                      focusTarget.selection.legIndex === legIndex &&
                      focusTarget.selection.waypointIndex === wpIndex
                        ? "ring-1 ring-yellow-400"
                        : ""
                    }`}
                    onClick={() => onSelect?.({ type: "waypoint", legIndex, waypointIndex: wpIndex })}
                  >
                    <span className="text-orange-400 text-xs shrink-0">
                      {wpIndex + 1}.
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={wp.lat}
                      onChange={(e) => {
                        const routeWaypoints = course.routeWaypoints.map(
                          (l) => [...l],
                        );
                        routeWaypoints[legIndex][wpIndex] = {
                          ...wp,
                          lat: Number(e.target.value),
                        };
                        update({ routeWaypoints });
                      }}
                      className="w-0 flex-1 bg-slate-700 text-white px-1 py-0.5 rounded text-xs"
                    />
                    <input
                      type="number"
                      step="any"
                      value={wp.lng}
                      onChange={(e) => {
                        const routeWaypoints = course.routeWaypoints.map(
                          (l) => [...l],
                        );
                        routeWaypoints[legIndex][wpIndex] = {
                          ...wp,
                          lng: Number(e.target.value),
                        };
                        update({ routeWaypoints });
                      }}
                      className="w-0 flex-1 bg-slate-700 text-white px-1 py-0.5 rounded text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const routeWaypoints = course.routeWaypoints.map(
                          (l) => [...l],
                        );
                        routeWaypoints[legIndex].splice(wpIndex, 1);
                        update({ routeWaypoints });
                      }}
                      className="text-red-400 hover:text-red-300 text-xs shrink-0 px-1"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-1">
        <button
          onClick={onSave}
          disabled={saveState.status === "loading" || !course.key || !course.name}
          className={`w-full text-white py-2 rounded font-medium transition-all ${
            saveState.status === "success"
              ? "bg-green-600 hover:bg-green-500"
              : "bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500"
          }`}
        >
          {saveState.status === "loading"
            ? "Saving..."
            : saveState.status === "success"
              ? "Saved"
              : "Save Course"}
        </button>
        {saveState.status === "error" && (
          <div className="text-red-400 text-xs">{saveState.error}</div>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          const json = JSON.stringify(course, null, 2);
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${course.key || "course"}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }}
        className="w-full text-slate-400 hover:text-white py-2 text-sm transition-all border border-slate-700 hover:border-slate-500 rounded"
      >
        Download JSON
      </button>
    </div>
  );
}

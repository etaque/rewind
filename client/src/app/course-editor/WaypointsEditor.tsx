import { Course, LngLat } from "../../models";
import LngLatInput from "./LngLatInput";
import Section from "./Section";
import { PlacementMode } from "./placement";

type Props = {
  course: Course;
  onChange: (course: Course) => void;
  setPlacement: (mode: PlacementMode) => void;
};

function legLabel(course: Course, legIndex: number): string {
  const numGates = course.gates.length;
  const from = legIndex === 0 ? "Start" : `Gate ${legIndex}`;
  const to = legIndex === numGates ? "Finish" : `Gate ${legIndex + 1}`;
  return `Leg ${legIndex + 1}: ${from} \u2192 ${to}`;
}

export default function WaypointsEditor({ course, onChange, setPlacement }: Props) {
  const numLegs = course.gates.length + 1;

  const updateWaypoint = (leg: number, wpIndex: number, value: LngLat) => {
    const routeWaypoints = course.routeWaypoints.map((wps, i) =>
      i === leg ? wps.map((wp, j) => (j === wpIndex ? value : wp)) : wps,
    );
    onChange({ ...course, routeWaypoints });
  };

  const removeWaypoint = (leg: number, wpIndex: number) => {
    const routeWaypoints = course.routeWaypoints.map((wps, i) =>
      i === leg ? wps.filter((_, j) => j !== wpIndex) : wps,
    );
    onChange({ ...course, routeWaypoints });
  };

  return (
    <div className="space-y-3">
      {Array.from({ length: numLegs }, (_, leg) => {
        const waypoints = course.routeWaypoints[leg] ?? [];
        return (
          <Section key={leg} label={legLabel(course, leg)}>
            {waypoints.length === 0 && (
              <div className="text-slate-500 text-xs">No waypoints</div>
            )}
            {waypoints.map((wp, wpIndex) => (
              <div key={wpIndex} className="flex items-end gap-2">
                <div className="flex-1">
                  <span className="text-slate-500 text-xs">Point {wpIndex + 1}</span>
                  <LngLatInput
                    value={wp}
                    onChange={(v) => updateWaypoint(leg, wpIndex, v)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeWaypoint(leg, wpIndex)}
                  className="text-red-400 hover:text-red-300 text-sm pb-1"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setPlacement({ type: "waypoint", leg })}
              className="w-full py-1 text-xs text-blue-400 hover:text-blue-300 border border-dashed border-slate-600 rounded"
            >
              + Add Waypoint
            </button>
          </Section>
        );
      })}
    </div>
  );
}

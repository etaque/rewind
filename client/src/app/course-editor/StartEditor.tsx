import { Course } from "../../models";
import LngLatInput from "./LngLatInput";
import { PlacementMode } from "./placement";

type Props = {
  course: Course;
  onChange: (course: Course) => void;
  setPlacement: (mode: PlacementMode) => void;
};

export default function StartEditor({ course, onChange, setPlacement }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-400 text-xs">Start Position</span>
          <button
            type="button"
            onClick={() => setPlacement({ type: "start" })}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Pick on map
          </button>
        </div>
        <LngLatInput
          value={course.start}
          onChange={(start) => onChange({ ...course, start })}
        />
      </div>

      <label className="block">
        <span className="text-slate-400 text-xs">Start Heading (degrees)</span>
        <input
          type="number"
          value={course.startHeading}
          min={0}
          max={360}
          step={1}
          onChange={(e) =>
            onChange({ ...course, startHeading: parseFloat(e.target.value) || 0 })
          }
          className="w-full bg-slate-800 text-white px-2 py-1 rounded border border-slate-700 focus:border-blue-500 focus:outline-none text-sm"
        />
      </label>
    </div>
  );
}

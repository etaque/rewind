import { Course } from "../../models";

type Props = {
  course: Course;
  onChange: (course: Course) => void;
};

function inputClass() {
  return "w-full bg-slate-800 text-white px-2 py-1 rounded border border-slate-700 focus:border-blue-500 focus:outline-none text-sm";
}

export default function CourseMetadataForm({ course, onChange }: Props) {
  const update = <K extends keyof Course>(key: K, value: Course[K]) => {
    onChange({ ...course, [key]: value });
  };

  // Convert Unix ms to datetime-local input value
  const startTimeValue = course.startTime
    ? new Date(course.startTime).toISOString().slice(0, 16)
    : "";

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-slate-400 text-xs">Key</span>
        <input
          type="text"
          value={course.key}
          onChange={(e) => update("key", e.target.value)}
          className={inputClass()}
          placeholder="vendee-globe-2020"
        />
      </label>

      <label className="block">
        <span className="text-slate-400 text-xs">Name</span>
        <input
          type="text"
          value={course.name}
          onChange={(e) => update("name", e.target.value)}
          className={inputClass()}
          placeholder="Vendée Globe 2020"
        />
      </label>

      <label className="block">
        <span className="text-slate-400 text-xs">Description</span>
        <textarea
          value={course.description}
          onChange={(e) => update("description", e.target.value)}
          className={inputClass() + " resize-y min-h-[60px]"}
          rows={2}
        />
      </label>

      <label className="block">
        <span className="text-slate-400 text-xs">Polar</span>
        <input
          type="text"
          value={course.polar}
          onChange={(e) => update("polar", e.target.value)}
          className={inputClass()}
          placeholder="imoca60"
        />
      </label>

      <label className="block">
        <span className="text-slate-400 text-xs">Start Time</span>
        <input
          type="datetime-local"
          value={startTimeValue}
          onChange={(e) => {
            const ms = new Date(e.target.value).getTime();
            if (!isNaN(ms)) update("startTime", ms);
          }}
          className={inputClass()}
        />
      </label>

      <div className="flex gap-3">
        <label className="flex-1">
          <span className="text-slate-400 text-xs">Time Factor</span>
          <input
            type="number"
            value={course.timeFactor}
            min={1}
            step={1}
            onChange={(e) => update("timeFactor", parseFloat(e.target.value) || 1)}
            className={inputClass()}
          />
        </label>

        <label className="flex-1">
          <span className="text-slate-400 text-xs">Max Days</span>
          <input
            type="number"
            value={course.maxDays}
            min={1}
            step={1}
            onChange={(e) => update("maxDays", parseFloat(e.target.value) || 1)}
            className={inputClass()}
          />
        </label>
      </div>
    </div>
  );
}

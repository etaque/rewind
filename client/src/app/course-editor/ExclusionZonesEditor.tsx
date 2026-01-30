import { Course, ExclusionZone, LngLat } from "../../models";
import LngLatInput from "./LngLatInput";
import Section from "./Section";
import { PlacementMode } from "./placement";

type Props = {
  course: Course;
  onChange: (course: Course) => void;
  setPlacement: (mode: PlacementMode) => void;
};

const defaultZone: ExclusionZone = {
  name: "New Zone",
  polygon: [],
};

export default function ExclusionZonesEditor({ course, onChange, setPlacement }: Props) {
  const updateZone = (index: number, zone: ExclusionZone) => {
    const exclusionZones = course.exclusionZones.map((z, i) =>
      i === index ? zone : z,
    );
    onChange({ ...course, exclusionZones });
  };

  const addZone = () => {
    onChange({
      ...course,
      exclusionZones: [...course.exclusionZones, { ...defaultZone }],
    });
  };

  const removeZone = (index: number) => {
    onChange({
      ...course,
      exclusionZones: course.exclusionZones.filter((_, i) => i !== index),
    });
  };

  const updatePoint = (zoneIndex: number, pointIndex: number, value: LngLat) => {
    const zone = course.exclusionZones[zoneIndex];
    const polygon = zone.polygon.map((p, i) => (i === pointIndex ? value : p));
    updateZone(zoneIndex, { ...zone, polygon });
  };

  const removePoint = (zoneIndex: number, pointIndex: number) => {
    const zone = course.exclusionZones[zoneIndex];
    const polygon = zone.polygon.filter((_, i) => i !== pointIndex);
    updateZone(zoneIndex, { ...zone, polygon });
  };

  return (
    <div className="space-y-3">
      {course.exclusionZones.map((zone, zoneIndex) => (
        <Section key={zoneIndex} label={zone.name || `Zone ${zoneIndex + 1}`}>
          <label className="block">
            <span className="text-slate-400 text-xs">Name</span>
            <input
              type="text"
              value={zone.name}
              onChange={(e) => updateZone(zoneIndex, { ...zone, name: e.target.value })}
              className="w-full bg-slate-800 text-white px-2 py-1 rounded border border-slate-700 focus:border-blue-500 focus:outline-none text-sm"
            />
          </label>

          {zone.polygon.length === 0 && (
            <div className="text-slate-500 text-xs">No points</div>
          )}

          {zone.polygon.map((point, pointIndex) => (
            <div key={pointIndex} className="flex items-end gap-2">
              <div className="flex-1">
                <span className="text-slate-500 text-xs">Point {pointIndex + 1}</span>
                <LngLatInput
                  value={point}
                  onChange={(v) => updatePoint(zoneIndex, pointIndex, v)}
                />
              </div>
              <button
                type="button"
                onClick={() => removePoint(zoneIndex, pointIndex)}
                className="text-red-400 hover:text-red-300 text-sm pb-1"
              >
                ✕
              </button>
            </div>
          ))}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPlacement({ type: "exclusionPoint", zone: zoneIndex })}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Pick on map
            </button>
            <button
              type="button"
              onClick={() => removeZone(zoneIndex)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Remove zone
            </button>
          </div>
        </Section>
      ))}

      <button
        type="button"
        onClick={addZone}
        className="w-full py-1.5 text-sm text-blue-400 hover:text-blue-300 border border-dashed border-slate-600 rounded-lg"
      >
        + Add Exclusion Zone
      </button>
    </div>
  );
}

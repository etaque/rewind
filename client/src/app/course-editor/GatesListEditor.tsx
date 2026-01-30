import { Course, Gate } from "../../models";
import GateEditor from "./GateEditor";
import Section from "./Section";
import { PlacementMode } from "./placement";

type Props = {
  course: Course;
  onChange: (course: Course) => void;
  setPlacement: (mode: PlacementMode) => void;
};

const defaultGate: Gate = {
  center: { lng: 0, lat: 0 },
  orientation: 90,
  lengthNm: 5,
};

export default function GatesListEditor({ course, onChange, setPlacement }: Props) {
  const updateFinishLine = (finishLine: Gate) => {
    onChange({ ...course, finishLine });
  };

  const updateGate = (index: number, gate: Gate) => {
    const gates = [...course.gates];
    gates[index] = gate;
    onChange({ ...course, gates });
  };

  const addGate = () => {
    const gates = [...course.gates, { ...defaultGate }];
    const routeWaypoints = [...course.routeWaypoints, []];
    onChange({ ...course, gates, routeWaypoints });
  };

  const removeGate = (index: number) => {
    const gates = course.gates.filter((_, i) => i !== index);
    const routeWaypoints = [...course.routeWaypoints];
    if (index + 1 < routeWaypoints.length) {
      const merged = [
        ...(routeWaypoints[index] ?? []),
        ...(routeWaypoints[index + 1] ?? []),
      ];
      routeWaypoints.splice(index, 2, merged);
    } else {
      routeWaypoints.splice(index, 1);
    }
    onChange({ ...course, gates, routeWaypoints });
  };

  return (
    <div className="space-y-3">
      <Section label="Finish Line" defaultOpen>
        <GateEditor
          gate={course.finishLine}
          onChange={updateFinishLine}
          onPickCenter={() => setPlacement({ type: "finishLine" })}
          label="Finish"
        />
      </Section>

      {course.gates.map((gate, i) => (
        <Section key={i} label={`Gate ${i + 1}`}>
          <GateEditor
            gate={gate}
            onChange={(g) => updateGate(i, g)}
            onPickCenter={() => setPlacement({ type: "gateCenter", index: i })}
            label={`Gate ${i + 1}`}
          />
          <button
            type="button"
            onClick={() => removeGate(i)}
            className="text-xs text-red-400 hover:text-red-300 mt-1"
          >
            Remove gate
          </button>
        </Section>
      ))}

      <button
        type="button"
        onClick={addGate}
        className="w-full py-1.5 text-sm text-blue-400 hover:text-blue-300 border border-dashed border-slate-600 rounded-lg"
      >
        + Add Gate
      </button>
    </div>
  );
}

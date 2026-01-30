import { Gate } from "../../models";
import LngLatInput from "./LngLatInput";

type Props = {
  gate: Gate;
  onChange: (gate: Gate) => void;
  onPickCenter: () => void;
  label: string;
};

export default function GateEditor({ gate, onChange, onPickCenter, label }: Props) {
  return (
    <div className="space-y-2">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-400 text-xs">{label} Center</span>
          <button
            type="button"
            onClick={onPickCenter}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Pick on map
          </button>
        </div>
        <LngLatInput
          value={gate.center}
          onChange={(center) => onChange({ ...gate, center })}
        />
      </div>

      <div>
        <span className="text-slate-400 text-xs">Orientation</span>
        <div className="flex gap-1 mt-1">
          {[
            { value: 0, label: "N-S" },
            { value: 45, label: "NE-SW" },
            { value: 90, label: "E-W" },
            { value: 135, label: "NW-SE" },
          ].map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange({ ...gate, orientation: preset.value })}
              className={`flex-1 py-1 text-xs rounded transition-colors ${
                gate.orientation === preset.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-slate-400 text-xs">Length (nm)</span>
        <input
          type="number"
          value={gate.lengthNm}
          min={0}
          step={0.1}
          onChange={(e) =>
            onChange({ ...gate, lengthNm: parseFloat(e.target.value) || 0 })
          }
          className="w-full bg-slate-800 text-white px-2 py-1 rounded border border-slate-700 focus:border-blue-500 focus:outline-none text-sm"
        />
      </label>
    </div>
  );
}

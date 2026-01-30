import { useState } from "react";
import { LngLat } from "../../models";

type Props = {
  value: LngLat;
  onChange: (value: LngLat) => void;
};

function format(value: LngLat): string {
  return `${value.lng}, ${value.lat}`;
}

function parse(text: string): LngLat | null {
  // Accept "lng, lat" or "lng lat" with optional separators
  const parts = text
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const lng = parseFloat(parts[0]);
  const lat = parseFloat(parts[1]);
  if (isNaN(lng) || isNaN(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return { lng, lat };
}

export default function LngLatInput({ value, onChange }: Props) {
  const [text, setText] = useState(format(value));
  const [focused, setFocused] = useState(false);

  // Sync from parent when not editing
  const displayed = focused ? text : format(value);

  const handleChange = (raw: string) => {
    setText(raw);
    const parsed = parse(raw);
    if (parsed) onChange(parsed);
  };

  return (
    <input
      type="text"
      value={displayed}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={() => {
        setFocused(true);
        setText(format(value));
      }}
      onBlur={() => {
        setFocused(false);
        const parsed = parse(text);
        if (parsed) onChange(parsed);
      }}
      placeholder="lng, lat"
      className="w-full bg-slate-800 text-white px-2 py-1 rounded border border-slate-700 focus:border-blue-500 focus:outline-none text-sm font-mono"
    />
  );
}

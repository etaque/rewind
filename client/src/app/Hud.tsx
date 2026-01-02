import { LngLat } from "../models";

type Props = {
  position: LngLat;
  heading: number;
};

function formatCoord(value: number, pos: string, neg: string): string {
  const dir = value >= 0 ? pos : neg;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = ((abs - deg) * 60).toFixed(2);
  return `${deg}°${min}'${dir}`;
}

function formatHeading(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  return `${normalized.toFixed(0)}°`;
}

export default function Hud({ position, heading }: Props) {
  const lat = formatCoord(position.lat, "N", "S");
  const lng = formatCoord(position.lng, "E", "W");

  return (
    <div className="absolute top-4 right-4 bg-black/60 text-white px-4 py-3 rounded-lg font-mono text-sm">
      <div className="flex flex-col gap-1">
        <div>
          <span className="text-gray-400">POS </span>
          <span>
            {lat} {lng}
          </span>
        </div>
        <div>
          <span className="text-gray-400">HDG </span>
          <span>{formatHeading(heading)}</span>
        </div>
      </div>
    </div>
  );
}

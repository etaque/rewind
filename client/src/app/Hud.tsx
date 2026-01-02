import { LngLat, WindSpeed } from "../models";

type Props = {
  position: LngLat;
  heading: number;
  courseTime: number;
  windSpeed: WindSpeed;
  boatSpeed: number;
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

function formatCourseTime(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}Z`;
}

function formatWindSpeed(windSpeed: WindSpeed): string {
  const speed = Math.sqrt(windSpeed.u ** 2 + windSpeed.v ** 2);
  const knots = speed * 1.944; // m/s to knots
  return `${knots.toFixed(1)}kts`;
}

function formatWindDirection(windSpeed: WindSpeed): string {
  // Wind direction is where wind comes FROM (meteorological convention)
  // u = east component, v = north component
  const radians = Math.atan2(-windSpeed.u, -windSpeed.v);
  const degrees = ((radians * 180) / Math.PI + 360) % 360;
  return `${degrees.toFixed(0)}°`;
}

export default function Hud({
  position,
  heading,
  courseTime,
  windSpeed,
  boatSpeed,
}: Props) {
  const lat = formatCoord(position.lat, "N", "S");
  const lng = formatCoord(position.lng, "E", "W");

  return (
    <div className="absolute top-4 right-4 bg-black/60 text-white px-4 py-3 rounded-lg font-mono text-sm">
      <div className="flex flex-col gap-1">
        <div>
          <span className="text-gray-400">UTC </span>
          <span>{formatCourseTime(courseTime)}</span>
        </div>
        <div>
          <span className="text-gray-400">POS </span>
          <span>
            {lat} {lng}
          </span>
        </div>
        <div>
          <span className="text-gray-400">HDG </span>
          <span>{formatHeading(heading)}</span>
          <span className="text-gray-400 ml-2">BSP </span>
          <span>{boatSpeed.toFixed(1)}kts</span>
        </div>
        <div>
          <span className="text-gray-400">TWD </span>
          <span>{formatWindDirection(windSpeed)}</span>
          <span className="text-gray-400 ml-2">TWS </span>
          <span>{formatWindSpeed(windSpeed)}</span>
        </div>
      </div>
    </div>
  );
}

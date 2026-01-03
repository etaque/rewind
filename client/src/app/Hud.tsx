import { WindSpeed } from "../models";
import { Session } from "./state";

type Props = {
  session: Session;
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

function calculateTWA(heading: number, windSpeed: WindSpeed): number {
  const radians = Math.atan2(-windSpeed.u, -windSpeed.v);
  const windDirection = ((radians * 180) / Math.PI + 360) % 360;
  let twa = windDirection - heading;
  while (twa > 180) twa -= 360;
  while (twa < -180) twa += 360;
  return Math.abs(twa);
}

export default function Hud({ session }: Props) {
  const lat = formatCoord(session.position.lat, "N", "S");
  const lng = formatCoord(session.position.lng, "E", "W");

  return (
    <div className="absolute top-4 right-4 bg-black/60 text-white px-4 py-3 rounded-lg font-mono text-sm">
      <div className="flex flex-col gap-1">
        <div>
          <span className="text-gray-400">UTC </span>
          <span>{formatCourseTime(session.courseTime)}</span>
        </div>
        {session.currentReport && (
          <div>
            <span className="text-gray-400">REP </span>
            <span>{formatCourseTime(session.currentReport.time)}</span>
          </div>
        )}
        <div>
          <span className="text-gray-400">POS </span>
          <span>
            {lat} {lng}
          </span>
        </div>
        <div>
          <span className="text-gray-400">HDG </span>
          <span>{formatHeading(session.heading)}</span>
          <span className="text-gray-400 ml-2">BSP </span>
          <span>{session.boatSpeed.toFixed(1)}kts</span>
        </div>
        <div>
          <span className="text-gray-400">TWD </span>
          <span>{formatWindDirection(session.windSpeed)}</span>
          <span className="text-gray-400 ml-2">TWS </span>
          <span>{formatWindSpeed(session.windSpeed)}</span>
          <span className="text-gray-400 ml-2">TWA </span>
          <span>
            {calculateTWA(session.heading, session.windSpeed).toFixed(0)}°
          </span>
          {session.lockedTWA !== null && (
            <span className="ml-1 text-green-400">[LOCK]</span>
          )}
        </div>
      </div>
    </div>
  );
}

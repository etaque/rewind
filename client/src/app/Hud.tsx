import { Session } from "./state";
import { calculateTWA, calculateVMG } from "./polar";
import { getWindDirection, getWindSpeedKnots } from "../utils";

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

export default function Hud({ session }: Props) {
  const lat = formatCoord(session.position.lat, "N", "S");
  const lng = formatCoord(session.position.lng, "E", "W");
  const twa = calculateTWA(
    session.heading,
    getWindDirection(session.windSpeed),
  );
  const vmg = calculateVMG(session.boatSpeed, twa);

  return (
    <div className="absolute top-4 right-4 bg-black/60 text-white px-4 py-3 rounded-lg font-mono text-sm">
      <div className="flex flex-col gap-1">
        <div>
          <span className="text-gray-400">UTC </span>
          <span>{formatCourseTime(session.courseTime)}</span>
        </div>
        {session.currentSource && (
          <div>
            <span className="text-gray-400">REP </span>
            <span>{formatCourseTime(session.currentSource.time)}</span>
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
          <span>{getWindDirection(session.windSpeed).toFixed(0)}°</span>
          <span className="text-gray-400 ml-2">TWS </span>
          <span>{getWindSpeedKnots(session.windSpeed).toFixed(1)}kts</span>
        </div>
        <div>
          <span className="text-gray-400">TWA </span>
          <span>{twa.toFixed(0)}°</span>
          {session.lockedTWA !== null && (
            <span className="ml-1 text-green-400">[LOCK]</span>
          )}
          <span className="text-gray-400 ml-2">VMG </span>
          <span className={vmg >= 0 ? "text-green-400" : "text-orange-400"}>
            {vmg >= 0 ? "+" : ""}
            {vmg.toFixed(1)}kts
          </span>
        </div>
      </div>
    </div>
  );
}

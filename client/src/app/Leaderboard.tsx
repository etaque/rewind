import { LeaderboardEntry } from "../multiplayer/types";

type Props = {
  entries: LeaderboardEntry[];
  myPlayerId: string;
  courseStartTime: number;
};

function formatDistance(nm: number): string {
  if (nm < 10) {
    return `${nm.toFixed(1)} nm`;
  }
  return `${Math.round(nm)} nm`;
}

function formatRaceTime(finishTime: number, startTime: number): string {
  const elapsedMs = finishTime - startTime;
  const days = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor(
    (elapsedMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000),
  );
  const minutes = Math.floor((elapsedMs % (60 * 60 * 1000)) / (60 * 1000));

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

export default function Leaderboard({
  entries,
  myPlayerId,
  courseStartTime,
}: Props) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-4 left-4 bg-black/60 text-white px-4 py-3 rounded-lg font-mono text-sm min-w-48">
      <div className="text-gray-400 text-xs mb-2 uppercase tracking-wide">
        Leaderboard
      </div>
      <div className="flex flex-col gap-1">
        {entries.map((entry, index) => {
          const isMe = entry.playerId === myPlayerId;
          const isFinished = entry.finishTime !== null;
          return (
            <div
              key={entry.playerId}
              className={`flex justify-between gap-4 ${isMe ? "text-pink-400" : ""}`}
            >
              <span>
                {index + 1}. {entry.playerName}
                {isFinished && " \u2713"}
              </span>
              <span className={isFinished ? "text-green-400" : "text-gray-400"}>
                {isFinished
                  ? formatRaceTime(entry.finishTime!, courseStartTime)
                  : formatDistance(entry.distanceToFinish)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

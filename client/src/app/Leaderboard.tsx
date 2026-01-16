import { LeaderboardEntry } from "../multiplayer/types";

type Props = {
  entries: LeaderboardEntry[];
  myPlayerId: string;
};

function formatDistance(nm: number): string {
  if (nm < 10) {
    return `${nm.toFixed(1)} nm`;
  }
  return `${Math.round(nm)} nm`;
}

export default function Leaderboard({ entries, myPlayerId }: Props) {
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
          const isMe = entry.player_id === myPlayerId;
          return (
            <div
              key={entry.player_id}
              className={`flex justify-between gap-4 ${isMe ? "text-pink-400" : ""}`}
            >
              <span>
                {index + 1}. {entry.player_name}
              </span>
              <span className="text-gray-400">
                {formatDistance(entry.distance_to_finish)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

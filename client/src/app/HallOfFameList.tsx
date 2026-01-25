import { useState, useEffect } from "react";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

export type HallOfFameEntry = {
  id: number;
  rank: number;
  playerName: string;
  finishTime: number;
  raceDate: number;
};

type Props = {
  courseKey: string;
  activeGhostIds: Set<number>;
  onAddGhost: (entryId: number, playerName: string) => void;
};

export default function HallOfFameList({
  courseKey,
  activeGhostIds,
  onAddGhost,
}: Props) {
  const [entries, setEntries] = useState<HallOfFameEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${serverUrl}/leaderboard/${courseKey}?limit=10`,
        );
        if (res.ok) {
          const data = await res.json();
          setEntries(data);
        }
      } catch (err) {
        console.error("Failed to fetch leaderboard:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [courseKey]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }
    return `${hours}h ${minutes}m`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-amber-400 font-semibold">Hall of Fame</h2>

      {loading ? (
        <div className="text-slate-400 text-sm py-4">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-slate-500 text-sm py-4">
          No records yet. Be the first to finish!
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`font-bold w-6 text-sm ${
                    entry.rank === 1
                      ? "text-yellow-400"
                      : entry.rank === 2
                        ? "text-slate-300"
                        : entry.rank === 3
                          ? "text-amber-600"
                          : "text-slate-500"
                  }`}
                >
                  #{entry.rank}
                </span>
                <div>
                  <div className="text-white text-sm">{entry.playerName}</div>
                  <div className="text-slate-500 text-xs">
                    {formatDate(entry.raceDate)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 font-mono text-sm">
                  {formatTime(entry.finishTime)}
                </span>
                {activeGhostIds.has(entry.id) ? (
                  <span className="text-amber-400 text-xs">Added</span>
                ) : (
                  <button
                    onClick={() => onAddGhost(entry.id, entry.playerName)}
                    className="text-blue-400 hover:text-blue-300 text-xs"
                  >
                    Race
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

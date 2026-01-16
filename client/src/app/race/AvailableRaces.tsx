import { PlayerInfo } from "../../multiplayer/types";

type RaceInfo = {
  id: string;
  course_key: string;
  players: PlayerInfo[];
  max_players: number;
  race_started: boolean;
  creator_id: string;
};

type Props = {
  races: RaceInfo[];
  onJoinRace: (raceId: string) => void;
};

export default function AvailableRaces({ races, onJoinRace }: Props) {
  if (races.length === 0) return null;

  return (
    <div className="space-y-2">
      <label className="text-slate-400 text-sm">Available Races</label>
      <div className="bg-slate-800 rounded-lg divide-y divide-slate-700 max-h-40 overflow-y-auto">
        {races.map((race) => (
          <button
            key={race.id}
            onClick={() => onJoinRace(race.id)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700 transition-all"
          >
            {race.players.map((playerInfo) => (
              <span key={playerInfo.id} className="text-white font-mono">
                {playerInfo.name}{" "}
                {playerInfo.id === race.creator_id ? "(Host)" : ""}
              </span>
            ))}
            <span className="text-slate-400 text-sm">
              {race.players.length}/{race.max_players} players
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export type { RaceInfo };

import { PeerState } from "../../multiplayer/types";
import { RecordedGhost } from "../App";

type Props = {
  players: PeerState[];
  myPlayerId: string | null;
  isCreator: boolean;
  totalPlayers: number;
  recordedGhosts: Map<number, RecordedGhost>;
  onRemoveGhost: (ghostId: number) => void;
};

export default function PlayerList({
  players,
  myPlayerId,
  isCreator,
  totalPlayers,
  recordedGhosts,
  onRemoveGhost,
}: Props) {
  const ghostCount = recordedGhosts.size;
  const totalParticipants = totalPlayers + ghostCount;

  return (
    <div className="space-y-2">
      <label className="text-slate-400 text-sm">
        Race ({totalParticipants} participant
        {totalParticipants !== 1 ? "s" : ""})
      </label>
      <div className="bg-slate-800 rounded-lg divide-y divide-slate-700">
        {/* Self */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-white">You</span>
          </div>
          {isCreator && (
            <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded">
              Host
            </span>
          )}
        </div>
        {/* Other players */}
        {players.map((player) => (
          <div
            key={player.id}
            className="px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-white">{player.name}</span>
            </div>
            <span className="text-xs text-slate-500">
              {player.id === myPlayerId ? "You" : "Connected"}
            </span>
          </div>
        ))}
        {/* Recorded ghosts */}
        {Array.from(recordedGhosts.values()).map((ghost) => (
          <div
            key={ghost.id}
            className="px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-white">{ghost.name}</span>
            </div>
            <button
              onClick={() => onRemoveGhost(ghost.id)}
              className="text-slate-400 hover:text-white text-sm"
            >
              ✕
            </button>
          </div>
        ))}
        {/* Empty slots hint */}
        {totalParticipants < 2 && (
          <div className="px-4 py-3 text-slate-500 text-sm italic">
            Add ghosts from Hall of Fame or wait for players...
          </div>
        )}
      </div>
    </div>
  );
}

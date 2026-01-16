import { PeerState } from "../../multiplayer/types";

type Props = {
  players: PeerState[];
  myPlayerId: string | null;
  isCreator: boolean;
  totalPlayers: number;
};

export default function PlayerList({
  players,
  myPlayerId,
  isCreator,
  totalPlayers,
}: Props) {
  return (
    <div className="space-y-2">
      <label className="text-slate-400 text-sm">
        Players ({totalPlayers}/10)
      </label>
      <div className="bg-slate-800 rounded-lg divide-y divide-slate-700">
        {/* Self */}
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-white">You</span>
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
            <span className="text-white">{player.name}</span>
            <span className="text-xs text-slate-500">
              {player.id === myPlayerId ? "You" : "Connected"}
            </span>
          </div>
        ))}
        {/* Empty slots hint */}
        {totalPlayers < 2 && (
          <div className="px-4 py-3 text-slate-500 text-sm italic">
            Waiting for players to join...
          </div>
        )}
      </div>
    </div>
  );
}

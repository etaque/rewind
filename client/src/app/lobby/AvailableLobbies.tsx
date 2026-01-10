import { PlayerInfo } from "../../multiplayer/types";

type LobbyInfo = {
  id: string;
  course_key: string;
  players: PlayerInfo[];
  max_players: number;
  race_started: boolean;
  creator_id: string;
};

type Props = {
  lobbies: LobbyInfo[];
  onJoinLobby: (lobbyId: string) => void;
};

export default function AvailableLobbies({ lobbies, onJoinLobby }: Props) {
  if (lobbies.length === 0) return null;

  return (
    <div className="space-y-2">
      <label className="text-slate-400 text-sm">Available Lobbies</label>
      <div className="bg-slate-800 rounded-lg divide-y divide-slate-700 max-h-40 overflow-y-auto">
        {lobbies.map((lobby) => (
          <button
            key={lobby.id}
            onClick={() => onJoinLobby(lobby.id)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700 transition-all"
          >
            {lobby.players.map((playerInfo) => (
              <span key={playerInfo.id} className="text-white font-mono">
                {playerInfo.name}{" "}
                {playerInfo.id === lobby.creator_id ? "(Host)" : ""}
              </span>
            ))}
            <span className="text-slate-400 text-sm">
              {lobby.players.length}/{lobby.max_players} players
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export type { LobbyInfo };

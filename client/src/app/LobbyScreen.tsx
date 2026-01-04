import { PeerState } from "../multiplayer/types";

type Props = {
  lobbyId: string;
  myPlayerId: string;
  isCreator: boolean;
  players: Map<string, PeerState>;
  countdown: number | null;
  onStartRace: () => void;
  onLeaveLobby: () => void;
};

export default function LobbyScreen({
  lobbyId,
  myPlayerId,
  isCreator,
  players,
  countdown,
  onStartRace,
  onLeaveLobby,
}: Props) {
  const playerList = Array.from(players.values());
  const totalPlayers = playerList.length + 1; // +1 for self

  const copyLobbyCode = () => {
    navigator.clipboard.writeText(lobbyId);
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black bg-opacity-10">
      <div className="bg-slate-900 bg-opacity-90 rounded-lg p-8 max-w-md w-full mx-4 space-y-6">
        {countdown !== null ? (
          <div className="text-center space-y-4">
            <h2 className="text-white text-2xl font-semibold">Race Starting</h2>
            <div className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">
              {countdown}
            </div>
          </div>
        ) : (
          <>
            {/* Lobby Code */}
            <div className="text-center space-y-2">
              <label className="text-slate-400 text-sm">Lobby Code</label>
              <button
                onClick={copyLobbyCode}
                className="block w-full bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-lg text-3xl tracking-widest font-mono transition-all"
                title="Click to copy"
              >
                {lobbyId}
              </button>
              <p className="text-slate-500 text-xs">Click to copy</p>
            </div>

            {/* Player List */}
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
                {playerList.map((player) => (
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

            {/* Actions */}
            <div className="space-y-4">
              {isCreator ? (
                <button
                  onClick={onStartRace}
                  disabled={totalPlayers < 2}
                  className="w-full bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 disabled:from-slate-600 disabled:to-slate-600 text-white py-3 px-6 rounded-lg font-semibold transition-all disabled:cursor-not-allowed"
                >
                  {totalPlayers < 2 ? "Need at least 2 players" : "Start Race"}
                </button>
              ) : (
                <div className="text-center text-slate-400 py-3">
                  Waiting for host to start the race...
                </div>
              )}
              <button
                onClick={onLeaveLobby}
                className="w-full text-slate-400 hover:text-white py-2 transition-all"
              >
                Leave Lobby
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

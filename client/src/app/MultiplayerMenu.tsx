import { useState, useEffect } from "react";

const PLAYER_NAME_KEY = "rewind:player_name";

type Props = {
  onCreateLobby: (playerName: string) => void;
  onJoinLobby: (lobbyId: string, playerName: string) => void;
  onBack: () => void;
};

export default function MultiplayerMenu({
  onCreateLobby,
  onJoinLobby,
  onBack,
}: Props) {
  const [playerName, setPlayerName] = useState("");
  const [lobbyId, setLobbyId] = useState("");
  const [mode, setMode] = useState<"menu" | "join">("menu");

  // Load player name from localStorage on mount
  useEffect(() => {
    const savedName = localStorage.getItem(PLAYER_NAME_KEY);
    if (savedName) {
      setPlayerName(savedName);
    }
  }, []);

  // Save player name to localStorage when it changes
  const handleNameChange = (name: string) => {
    setPlayerName(name);
    if (name.trim()) {
      localStorage.setItem(PLAYER_NAME_KEY, name.trim());
    }
  };

  const handleCreate = () => {
    const name = playerName.trim() || "Skipper";
    handleNameChange(name);
    onCreateLobby(name);
  };

  const handleJoin = () => {
    if (!lobbyId.trim()) return;
    const name = playerName.trim() || "Skipper";
    handleNameChange(name);
    onJoinLobby(lobbyId.trim().toUpperCase(), name);
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black bg-opacity-10">
      <div className="bg-slate-900 bg-opacity-90 rounded-lg p-8 max-w-md w-full mx-4 space-y-6">
        <h2 className="text-white text-2xl font-semibold text-center">
          Multiplayer
        </h2>

        {/* Player Name Input */}
        <div className="space-y-2">
          <label className="text-slate-400 text-sm">Your Name</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Skipper"
            maxLength={20}
            className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {mode === "menu" ? (
          <div className="space-y-4">
            <button
              onClick={handleCreate}
              className="w-full bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 text-white py-3 px-6 rounded-lg font-semibold transition-all"
            >
              Create Race
            </button>
            <button
              onClick={() => setMode("join")}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white py-3 px-6 rounded-lg font-semibold transition-all"
            >
              Join Race
            </button>
            <button
              onClick={onBack}
              className="w-full text-slate-400 hover:text-white py-2 transition-all"
            >
              Back
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-slate-400 text-sm">Lobby Code</label>
              <input
                type="text"
                value={lobbyId}
                onChange={(e) => setLobbyId(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none text-center text-2xl tracking-widest font-mono"
              />
            </div>
            <button
              onClick={handleJoin}
              disabled={!lobbyId.trim()}
              className="w-full bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 disabled:from-slate-600 disabled:to-slate-600 text-white py-3 px-6 rounded-lg font-semibold transition-all disabled:cursor-not-allowed"
            >
              Join
            </button>
            <button
              onClick={() => setMode("menu")}
              className="w-full text-slate-400 hover:text-white py-2 transition-all"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

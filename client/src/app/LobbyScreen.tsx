import { useState, useEffect } from "react";
import { PeerState } from "../multiplayer/types";

const PLAYER_NAME_KEY = "rewind:player_name";
const serverUrl = import.meta.env.REWIND_SERVER_URL;

type LobbyInfo = {
  id: string;
  course_key: string;
  player_count: number;
  max_players: number;
  race_started: boolean;
};

type Props = {
  lobbyId: string | null;
  myPlayerId: string | null;
  isCreator: boolean;
  players: Map<string, PeerState>;
  countdown: number | null;
  onCreateLobby: (playerName: string) => void;
  onJoinLobby: (lobbyId: string, playerName: string) => void;
  onStartRace: () => void;
  onLeaveLobby: () => void;
};

export default function LobbyScreen({
  lobbyId,
  myPlayerId,
  isCreator,
  players,
  countdown,
  onCreateLobby,
  onJoinLobby,
  onStartRace,
  onLeaveLobby,
}: Props) {
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [availableLobbies, setAvailableLobbies] = useState<LobbyInfo[]>([]);

  const playerList = Array.from(players.values());
  const totalPlayers = playerList.length + 1; // +1 for self
  const inLobby = lobbyId !== null;

  // Load player name from localStorage on mount and auto-create lobby
  useEffect(() => {
    const savedName = localStorage.getItem(PLAYER_NAME_KEY);
    if (savedName) {
      setPlayerName(savedName);
    }
    // Auto-create lobby when not in one
    if (!inLobby) {
      const name = savedName || "Skipper";
      onCreateLobby(name);
    }
  }, []);

  // Fetch available lobbies periodically
  useEffect(() => {
    const fetchLobbies = async () => {
      try {
        const res = await fetch(`${serverUrl}/multiplayer/lobbies`);
        const lobbies: LobbyInfo[] = await res.json();
        // Filter out our own lobby
        setAvailableLobbies(
          lobbyId ? lobbies.filter((l) => l.id !== lobbyId) : lobbies,
        );
      } catch (err) {
        console.error("Failed to fetch lobbies:", err);
      }
    };

    fetchLobbies();
    const interval = setInterval(fetchLobbies, 5000);
    return () => clearInterval(interval);
  }, [lobbyId]);

  const getPlayerName = () => {
    const name = playerName.trim() || "Skipper";
    localStorage.setItem(PLAYER_NAME_KEY, name);
    return name;
  };

  const handlePlayerNameChange = (newName: string) => {
    setPlayerName(newName);
    localStorage.setItem(PLAYER_NAME_KEY, newName);
  };

  const handleJoin = () => {
    if (joinCode.trim()) {
      onJoinLobby(joinCode.trim().toUpperCase(), getPlayerName());
      setJoinCode("");
      setShowJoinInput(false);
    }
  };

  const handleJoinLobby = (targetLobbyId: string) => {
    onJoinLobby(targetLobbyId, getPlayerName());
  };

  const copyLobbyCode = () => {
    if (navigator.clipboard && lobbyId) {
      navigator.clipboard.writeText(lobbyId);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black bg-opacity-10">
      {/* Logo always on top */}
      <h1 className="logo mb-6">Re:wind</h1>

      <div className="bg-slate-900 bg-opacity-90 rounded-lg p-8 max-w-md w-full mx-4 space-y-6">
        {countdown !== null ? (
          // Countdown view
          <div className="text-center space-y-4">
            <h2 className="text-white text-2xl font-semibold">Race Starting</h2>
            <div className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">
              {countdown}
            </div>
          </div>
        ) : !inLobby ? (
          // Loading state while auto-creating lobby
          <div className="text-center text-slate-400 py-4">Connecting...</div>
        ) : (
          // In-lobby view
          <>
            {/* Player name input */}
            <div className="space-y-2">
              <label className="text-slate-400 text-sm">Your Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => handlePlayerNameChange(e.target.value)}
                placeholder="Skipper"
                maxLength={20}
                className="w-full bg-slate-800 text-white text-center px-4 py-3 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Lobby Code */}
            <div className="text-center space-y-2">
              <label className="text-slate-400 text-sm">Lobby Code</label>
              <button
                onClick={copyLobbyCode}
                className="block w-full bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-lg text-3xl tracking-widest font-mono transition-all"
                title={
                  navigator.clipboard
                    ? "Click to copy"
                    : "Clipboard not supported"
                }
              >
                {lobbyId}
              </button>
              {navigator.clipboard && (
                <p className="text-slate-500 text-xs">Click to copy</p>
              )}
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
              {isCreator && (
                <button
                  onClick={onStartRace}
                  className="w-full bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 text-white py-3 px-6 rounded-lg font-semibold transition-all"
                >
                  {totalPlayers < 2 ? "Start Solo" : "Start Race"}
                </button>
              )}
              {!isCreator && (
                <div className="text-center text-slate-400 py-3">
                  Waiting for host to start the race...
                </div>
              )}

              {/* Available lobbies */}
              {availableLobbies.length > 0 && (
                <div className="space-y-2">
                  <label className="text-slate-400 text-sm">
                    Available Lobbies
                  </label>
                  <div className="bg-slate-800 rounded-lg divide-y divide-slate-700 max-h-40 overflow-y-auto">
                    {availableLobbies.map((lobby) => (
                      <button
                        key={lobby.id}
                        onClick={() => handleJoinLobby(lobby.id)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700 transition-all"
                      >
                        <span className="text-white font-mono">{lobby.id}</span>
                        <span className="text-slate-400 text-sm">
                          {lobby.player_count}/{lobby.max_players} players
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual join with code */}
              {showJoinInput ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="Enter lobby code"
                    maxLength={6}
                    className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none text-center text-xl tracking-widest font-mono"
                  />
                  <div className="flex space-x-2">
                    <button
                      onClick={handleJoin}
                      disabled={!joinCode.trim()}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 text-white py-2 px-4 rounded-lg font-semibold transition-all disabled:cursor-not-allowed"
                    >
                      Join
                    </button>
                    <button
                      onClick={() => setShowJoinInput(false)}
                      className="flex-1 text-slate-400 hover:text-white py-2 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowJoinInput(true)}
                  className="w-full text-slate-400 hover:text-white py-2 transition-all"
                >
                  {availableLobbies.length > 0
                    ? "Enter Code Manually"
                    : "Join with Code"}
                </button>
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

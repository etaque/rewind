import { useState, useEffect } from "react";
import { PeerState } from "../multiplayer/types";
import {
  PlayerList,
  AvailableLobbies,
  CountdownDisplay,
  PlayerNameInput,
  LobbyInfo,
} from "./lobby";

const PLAYER_NAME_KEY = "rewind:player_name";
const serverUrl = import.meta.env.REWIND_SERVER_URL;

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

  const handleJoinLobby = (targetLobbyId: string) => {
    onJoinLobby(targetLobbyId, getPlayerName());
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black bg-opacity-10">
      <h1 className="logo mb-6">Re:wind</h1>

      <div className="bg-slate-900 bg-opacity-90 rounded-lg p-8 max-w-md w-full mx-4 space-y-6">
        {countdown !== null ? (
          <CountdownDisplay countdown={countdown} />
        ) : !inLobby ? (
          <div className="text-center text-slate-400 py-4">Connecting...</div>
        ) : (
          <>
            <PlayerNameInput
              value={playerName}
              onChange={handlePlayerNameChange}
            />

            <PlayerList
              players={playerList}
              myPlayerId={myPlayerId}
              isCreator={isCreator}
              totalPlayers={totalPlayers}
            />

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

              <AvailableLobbies
                lobbies={availableLobbies}
                onJoinLobby={handleJoinLobby}
              />

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

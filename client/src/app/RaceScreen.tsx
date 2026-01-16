import { useState, useEffect } from "react";
import { PeerState } from "../multiplayer/types";
import { Course } from "../models";
import {
  PlayerList,
  AvailableRaces,
  CountdownDisplay,
  PlayerNameInput,
  RaceInfo,
} from "./race";

const PLAYER_NAME_KEY = "rewind:player_name";
const serverUrl = import.meta.env.REWIND_SERVER_URL;

type Props = {
  raceId: string | null;
  myPlayerId: string | null;
  isCreator: boolean;
  players: Map<string, PeerState>;
  countdown: number | null;
  courses: Course[];
  selectedCourseKey: string | null;
  onCourseChange: (courseKey: string) => void;
  onCreateRace: (playerName: string) => void;
  onJoinRace: (raceId: string, playerName: string) => void;
  onStartRace: () => void;
  onLeaveRace: () => void;
};

export default function RaceScreen({
  raceId,
  myPlayerId,
  isCreator,
  players,
  countdown,
  courses,
  selectedCourseKey,
  onCourseChange,
  onCreateRace,
  onJoinRace,
  onStartRace,
  onLeaveRace,
}: Props) {
  const [playerName, setPlayerName] = useState("");
  const [availableRaces, setAvailableRaces] = useState<RaceInfo[]>([]);

  const playerList = Array.from(players.values());
  const totalPlayers = playerList.length + 1; // +1 for self
  const inRace = raceId !== null;

  // Load player name from localStorage on mount and auto-create race
  useEffect(() => {
    const savedName = localStorage.getItem(PLAYER_NAME_KEY);
    if (savedName) {
      setPlayerName(savedName);
    }
    // Auto-create race when not in one
    if (!inRace) {
      const name = savedName || "Skipper";
      onCreateRace(name);
    }
  }, []);

  // Fetch available races periodically
  useEffect(() => {
    const fetchRaces = async () => {
      try {
        const res = await fetch(`${serverUrl}/multiplayer/races`);
        const races: RaceInfo[] = await res.json();
        setAvailableRaces(
          raceId ? races.filter((r) => r.id !== raceId) : races,
        );
      } catch (err) {
        console.error("Failed to fetch races:", err);
      }
    };

    fetchRaces();
    const interval = setInterval(fetchRaces, 5000);
    return () => clearInterval(interval);
  }, [raceId]);

  const getPlayerName = () => {
    const name = playerName.trim() || "Skipper";
    localStorage.setItem(PLAYER_NAME_KEY, name);
    return name;
  };

  const handlePlayerNameChange = (newName: string) => {
    setPlayerName(newName);
    localStorage.setItem(PLAYER_NAME_KEY, newName);
  };

  const handleJoinRace = (targetRaceId: string) => {
    onJoinRace(targetRaceId, getPlayerName());
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black bg-opacity-10">
      <h1 className="logo mb-6">Re:wind</h1>

      <div className="bg-slate-900 bg-opacity-90 rounded-lg p-8 max-w-md w-full mx-4 space-y-6">
        {countdown !== null ? (
          <CountdownDisplay countdown={countdown} />
        ) : !inRace ? (
          <div className="text-center text-slate-400 py-4">Connecting...</div>
        ) : (
          <>
            <PlayerNameInput
              value={playerName}
              onChange={handlePlayerNameChange}
            />

            {isCreator && courses.length > 1 && (
              <div className="space-y-2">
                <label className="text-slate-400 text-sm">Course</label>
                <select
                  value={selectedCourseKey || ""}
                  onChange={(e) => onCourseChange(e.target.value)}
                  className="w-full bg-slate-800 text-white rounded-lg px-4 py-3 border border-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  {courses.map((course) => (
                    <option key={course.key} value={course.key}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

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

              <AvailableRaces
                races={availableRaces}
                onJoinRace={handleJoinRace}
              />

              <button
                onClick={onLeaveRace}
                className="w-full text-slate-400 hover:text-white py-2 transition-all"
              >
                Leave Race
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

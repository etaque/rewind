import { useState, useEffect } from "react";

const PLAYER_NAME_KEY = "rewind:player_name";

type Props = {
  onStart: (playerName: string) => void;
};

export default function StartScreen({ onStart }: Props) {
  const [playerName, setPlayerName] = useState("");

  // Load player name from localStorage on mount
  useEffect(() => {
    const savedName = localStorage.getItem(PLAYER_NAME_KEY);
    if (savedName) {
      setPlayerName(savedName);
    }
  }, []);

  const handleStart = () => {
    const name = playerName.trim() || "Skipper";
    localStorage.setItem(PLAYER_NAME_KEY, name);
    onStart(name);
  };

  return (
    <div className="fixed inset-0 flex flex-col space-y-4 items-center justify-center bg-black bg-opacity-10">
      <h1 className="logo">Re:wind</h1>
      <input
        type="text"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        placeholder="Skipper"
        maxLength={20}
        className="bg-slate-800 bg-opacity-80 text-white text-center px-4 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none w-48"
      />
      <button className="btn-start" onClick={handleStart}>
        <RewindIcon />
      </button>
    </div>
  );
}

function RewindIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
    </svg>
  );
}

import { useState, useEffect, useMemo, useCallback } from "react";
import { RaceInfo } from "./race";
import { useRaceContext } from "./race-context";
import { generateNickname } from "./nickname";
import { getOrCreatePlayerId } from "./player-id";
import {
  Account,
  loadAccount,
  saveAccount,
  getActiveProfile,
} from "./account";
import AuthModal from "./AuthModal";
import ProfileSwitcher from "./ProfileSwitcher";
import ProfileManager from "./ProfileManager";

const PLAYER_NAME_KEY = "rewind:player_name";
const serverUrl = import.meta.env.REWIND_SERVER_URL;

type HallOfFameEntry = {
  id: number;
  rank: number;
  playerName: string;
  playerId: string | null;
  finishTime: number;
  raceDate: number;
};

export default function RaceChoiceScreen() {
  const {
    raceId,
    isCreator,
    players,
    windStatus,
    courses,
    selectedCourseKey,
    recordedGhosts,
    createRace,
    joinRace,
    startRace,
    leaveRace,
    selectCourse,
    openEditor,
    addGhost,
    removeGhost,
  } = useRaceContext();

  // Account state
  const [account, setAccount] = useState<Account | null>(() => loadAccount());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileManager, setShowProfileManager] = useState(false);

  // Player name for guests (accounts use profile name)
  const [guestPlayerName, setGuestPlayerName] = useState("");

  const [availableRaces, setAvailableRaces] = useState<RaceInfo[]>([]);
  const [hallOfFame, setHallOfFame] = useState<HallOfFameEntry[]>([]);

  // Get current player ID (from account or guest mode)
  const myPersistentId = useMemo(() => getOrCreatePlayerId(), [account]);

  // Get current player name (from active profile or guest name)
  const playerName = useMemo(() => {
    if (account) {
      const profile = getActiveProfile(account);
      return profile?.name ?? "";
    }
    return guestPlayerName;
  }, [account, guestPlayerName]);

  const playerList = Array.from(players.values());
  const ghostList = Array.from(recordedGhosts.values());
  const totalCompetitors = 1 + playerList.length + ghostList.length;
  const inRace = raceId !== null;

  const selectedCourse = courses.find((c) => c.key === selectedCourseKey);

  // Load guest player name from localStorage on mount
  useEffect(() => {
    if (!account) {
      const savedName = localStorage.getItem(PLAYER_NAME_KEY);
      if (savedName) {
        setGuestPlayerName(savedName);
      } else {
        const nickname = generateNickname();
        setGuestPlayerName(nickname);
        localStorage.setItem(PLAYER_NAME_KEY, nickname);
      }
    }
  }, [account]);

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

  // Fetch hall of fame when course changes
  useEffect(() => {
    if (!selectedCourseKey) {
      setHallOfFame([]);
      return;
    }

    const fetchHallOfFame = async () => {
      try {
        const res = await fetch(
          `${serverUrl}/leaderboard/${selectedCourseKey}?limit=10`,
        );
        if (res.ok) {
          setHallOfFame(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch leaderboard:", err);
      }
    };

    fetchHallOfFame();
  }, [selectedCourseKey]);

  const handleGuestPlayerNameChange = (newName: string) => {
    setGuestPlayerName(newName);
    localStorage.setItem(PLAYER_NAME_KEY, newName);
  };

  const handleGuestPlayerNameBlur = () => {
    if (!guestPlayerName.trim()) {
      const name = generateNickname();
      setGuestPlayerName(name);
      localStorage.setItem(PLAYER_NAME_KEY, name);
    }
  };

  const getPlayerNameForRace = useCallback(() => {
    if (account) {
      const profile = getActiveProfile(account);
      return profile?.name ?? "Player";
    }
    let name = guestPlayerName.trim();
    if (!name) {
      name = generateNickname();
      setGuestPlayerName(name);
    }
    localStorage.setItem(PLAYER_NAME_KEY, name);
    return name;
  }, [account, guestPlayerName]);

  const handleJoinRace = (targetRaceId: string) => {
    joinRace(targetRaceId, getPlayerNameForRace());
  };

  const handleCreateRace = () => {
    createRace(getPlayerNameForRace());
  };

  const handleAuthSuccess = (newAccount: Account) => {
    setAccount(newAccount);
    setShowAuthModal(false);
  };

  const handleAccountChange = (newAccount: Account | null) => {
    setAccount(newAccount);
    if (newAccount) {
      saveAccount(newAccount);
    }
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return days > 0
      ? `${days}d ${hours}h ${minutes}m`
      : `${hours}h ${minutes}m`;
  };

  const windReady = windStatus === "success";
  const windLoading = windStatus === "loading";

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black bg-opacity-10">
      <h1 className="logo mb-6">Re:wind</h1>

      <div className="bg-slate-900 bg-opacity-80 rounded-xl p-8 w-full max-w-3xl mx-4 flex gap-8">
        {/* Left column - Player/Profile, Courses, Open Races */}
        <div className="flex-1 space-y-5">
          {/* Player identity section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-slate-400 text-xs uppercase tracking-wide">
                {account ? "Profile" : "Player Name"}
              </h2>
              {!account && (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-all"
                >
                  Sign In
                </button>
              )}
            </div>

            {account ? (
              <ProfileSwitcher
                account={account}
                onAccountChange={handleAccountChange}
                onManageProfiles={() => setShowProfileManager(true)}
              />
            ) : (
              <input
                type="text"
                value={guestPlayerName}
                onChange={(e) => handleGuestPlayerNameChange(e.target.value)}
                onBlur={handleGuestPlayerNameBlur}
                placeholder="Your name"
                maxLength={20}
                className="w-full bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
              />
            )}

            {!account && (
              <p className="text-slate-500 text-xs mt-2">
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="text-blue-400 hover:text-blue-300"
                >
                  Sign in
                </button>{" "}
                to save profiles across devices
              </p>
            )}
          </div>

          {/* Courses */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-slate-400 text-xs uppercase tracking-wide">
                Courses
              </h2>
              <button
                onClick={openEditor}
                className="text-xs text-slate-500 hover:text-slate-300 transition-all"
              >
                Edit Courses
              </button>
            </div>
            <div className="bg-slate-800 rounded-lg divide-y divide-slate-700 max-h-48 overflow-y-auto">
              {courses.map((course) => (
                <button
                  key={course.key}
                  onClick={() => selectCourse(course.key)}
                  className={`w-full text-left px-4 py-2 transition-all text-sm flex items-center gap-2 ${
                    selectedCourseKey === course.key
                      ? "bg-blue-600 text-white"
                      : "text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      selectedCourseKey === course.key
                        ? "bg-white"
                        : "border border-slate-500"
                    }`}
                  />
                  {course.name}
                </button>
              ))}
            </div>
          </div>

          {/* Open Races */}
          {availableRaces.length > 0 && (
            <div>
              <h2 className="text-slate-400 text-xs uppercase tracking-wide mb-2">
                Open Races
              </h2>
              <div className="space-y-1">
                {availableRaces.map((race) => {
                  const hostPlayer = race.players.find(
                    (p) => p.id === race.creator_id,
                  );
                  return (
                    <button
                      key={race.id}
                      onClick={() => handleJoinRace(race.id)}
                      className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-between transition-all text-sm"
                    >
                      <span className="text-white">
                        {hostPlayer?.name || "Unknown"}'s race
                      </span>
                      <span className="text-slate-400">
                        {race.players.length}/{race.max_players}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right column - Context dependent */}
        <div className="flex-1 space-y-4">
          {!selectedCourseKey && !inRace && (
            /* Welcome text when no course selected */
            <div className="space-y-4">
              <h2 className="text-white text-lg font-semibold">
                Welcome to Re:wind
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Re:wind lets you relive legendary offshore sailing races against
                real historical wind conditions, accelerated in time.
              </p>
              <p className="text-slate-400 text-sm leading-relaxed">
                Experience riding weather systems around the world in minutes.
                Race against ghosts from the leaderboard or challenge your
                friends in multiplayer.
              </p>
              <p className="text-slate-500 text-sm">
                Select a course to get started.
              </p>
            </div>
          )}

          {selectedCourseKey && !inRace && selectedCourse && (
            /* Course preview - not in race */
            <div className="space-y-4">
              <div>
                <h2 className="text-white text-lg font-semibold">
                  {selectedCourse.name}
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  {selectedCourse.description}
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  {selectedCourse.timeFactor}x time acceleration
                </p>
              </div>

              {/* Hall of Fame */}
              <div>
                <h3 className="text-amber-400 text-xs uppercase tracking-wide mb-2">
                  Hall of Fame
                </h3>
                {hallOfFame.length === 0 ? (
                  <div className="text-slate-500 text-sm py-2">
                    No records yet. Be the first!
                  </div>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {hallOfFame.map((entry) => {
                      const isMe = entry.playerId === myPersistentId;
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`text-sm font-bold w-5 ${
                                entry.rank === 1
                                  ? "text-yellow-400"
                                  : entry.rank === 2
                                    ? "text-slate-300"
                                    : entry.rank === 3
                                      ? "text-amber-600"
                                      : "text-slate-500"
                              }`}
                            >
                              #{entry.rank}
                            </span>
                            <span className={`text-sm ${isMe ? "text-cyan-300" : "text-white"}`}>
                              {entry.playerName}
                              {isMe && <span className="text-cyan-400 text-xs ml-1">(you)</span>}
                            </span>
                          </div>
                          <span className="text-green-400 font-mono text-xs">
                            {formatTime(entry.finishTime)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Race this button */}
              <button
                onClick={handleCreateRace}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white py-4 rounded-lg font-semibold transition-all text-lg"
              >
                Race this
              </button>
            </div>
          )}

          {inRace && (
            /* Lobby - in race */
            <div className="space-y-4">
              {/* Competitors */}
              <div>
                <h2 className="text-slate-400 text-xs uppercase tracking-wide mb-2">
                  Competitors
                </h2>
                <div className="bg-slate-800 rounded-lg divide-y divide-slate-700">
                  {/* You */}
                  <div className="px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span className="text-white">{playerName || "You"}</span>
                    </div>
                    {isCreator && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                        Host
                      </span>
                    )}
                  </div>

                  {/* Other players */}
                  {playerList.map((player) => (
                    <div
                      key={player.id}
                      className="px-4 py-2 flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span className="text-white">{player.name}</span>
                    </div>
                  ))}

                  {/* Ghosts */}
                  {ghostList.map((ghost) => (
                    <div
                      key={ghost.id}
                      className="px-4 py-2 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        <span className="text-white">{ghost.name}</span>
                        <span className="text-xs text-slate-500">ghost</span>
                      </div>
                      <button
                        onClick={() => removeGhost(ghost.id)}
                        className="text-slate-500 hover:text-white text-sm"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hall of Fame for ghost selection */}
              <div>
                <h3 className="text-amber-400 text-xs uppercase tracking-wide mb-2">
                  Add Ghosts
                </h3>
                {hallOfFame.length === 0 ? (
                  <div className="text-slate-500 text-sm py-2">
                    No records yet.
                  </div>
                ) : (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {hallOfFame.map((entry) => {
                      const isAdded = recordedGhosts.has(entry.id);
                      const isMe = entry.playerId === myPersistentId;
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`text-sm font-bold w-5 ${
                                entry.rank === 1
                                  ? "text-yellow-400"
                                  : entry.rank === 2
                                    ? "text-slate-300"
                                    : entry.rank === 3
                                      ? "text-amber-600"
                                      : "text-slate-500"
                              }`}
                            >
                              #{entry.rank}
                            </span>
                            <span className={`text-sm ${isMe ? "text-cyan-300" : "text-white"}`}>
                              {entry.playerName}
                              {isMe && <span className="text-cyan-400 text-xs ml-1">(you)</span>}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-green-400 font-mono text-xs">
                              {formatTime(entry.finishTime)}
                            </span>
                            {isAdded ? (
                              <span className="text-amber-400 text-xs w-10 text-right">
                                Added
                              </span>
                            ) : (
                              <button
                                onClick={() =>
                                  addGhost(entry.id, entry.playerName)
                                }
                                className="text-blue-400 hover:text-blue-300 text-xs w-10 text-right"
                              >
                                Add
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Wind loading / Start button */}
              {windLoading && (
                <div className="flex items-center justify-center gap-2 text-slate-400 py-3">
                  <span className="w-4 h-4 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
                  <span>Loading wind data...</span>
                </div>
              )}

              {windStatus === "error" && (
                <div className="text-center text-red-400 py-3">
                  Failed to load wind data. Try again.
                </div>
              )}

              {windReady && isCreator && (
                <button
                  onClick={startRace}
                  className="w-full bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-white py-4 rounded-lg font-semibold transition-all text-lg"
                >
                  {totalCompetitors === 1 ? "Start Solo" : "Start Race"}
                </button>
              )}

              {windReady && !isCreator && (
                <div className="text-center text-slate-400 py-3">
                  Waiting for host to start...
                </div>
              )}

              <button
                onClick={leaveRace}
                className="w-full text-slate-500 hover:text-slate-300 py-2 text-sm transition-all"
              >
                Leave Race
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      )}

      {/* Profile Manager Modal */}
      {showProfileManager && account && (
        <ProfileManager
          account={account}
          onAccountChange={handleAccountChange}
          onClose={() => setShowProfileManager(false)}
        />
      )}
    </div>
  );
}

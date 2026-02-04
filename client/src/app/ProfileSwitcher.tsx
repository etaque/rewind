import { useState, useRef, useEffect } from "react";
import { Account, Profile, setActiveProfile, logout } from "./account";

type ProfileSwitcherProps = {
  account: Account;
  onAccountChange: (account: Account | null) => void;
  onManageProfiles: () => void;
};

export default function ProfileSwitcher({
  account,
  onAccountChange,
  onManageProfiles,
}: ProfileSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeProfile = account.profiles.find(
    (p) => p.id === account.activeProfileId
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelectProfile = (profile: Profile) => {
    const updated = setActiveProfile(account, profile.id);
    onAccountChange(updated);
    setIsOpen(false);
  };

  const handleLogout = async () => {
    await logout(account);
    onAccountChange(null);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg transition-all"
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
          {activeProfile?.name.charAt(0).toUpperCase() ?? "?"}
        </div>
        <span className="text-white text-sm max-w-24 truncate">
          {activeProfile?.name ?? "Select profile"}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-56 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-1 z-50">
          {/* Account email */}
          <div className="px-3 py-2 border-b border-slate-700">
            <p className="text-slate-500 text-xs uppercase tracking-wide">
              Signed in as
            </p>
            <p className="text-slate-300 text-sm truncate">{account.email}</p>
          </div>

          {/* Profile list */}
          <div className="py-1">
            <p className="px-3 py-1 text-slate-500 text-xs uppercase tracking-wide">
              Profiles
            </p>
            {account.profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => handleSelectProfile(profile)}
                className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-all ${
                  profile.id === account.activeProfileId
                    ? "bg-slate-700"
                    : ""
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                    profile.id === account.activeProfileId
                      ? "bg-gradient-to-br from-cyan-400 to-blue-500"
                      : "bg-slate-600"
                  }`}
                >
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-white text-sm flex-1 text-left truncate">
                  {profile.name}
                </span>
                {profile.id === account.activeProfileId && (
                  <svg
                    className="w-4 h-4 text-cyan-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="border-t border-slate-700 py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                onManageProfiles();
              }}
              className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-all flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              Manage profiles
            </button>
            <button
              onClick={handleLogout}
              className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-all flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

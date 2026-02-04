import { useState } from "react";
import {
  Account,
  Profile,
  createProfile,
  updateProfile,
  deleteProfile,
} from "./account";

type ProfileManagerProps = {
  account: Account;
  onAccountChange: (account: Account) => void;
  onClose: () => void;
};

export default function ProfileManager({
  account,
  onAccountChange,
  onClose,
}: ProfileManagerProps) {
  const [newProfileName, setNewProfileName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProfileName.trim();
    if (!name) return;

    setLoading(true);
    setError(null);

    try {
      const updated = await createProfile(account, name);
      onAccountChange(updated);
      setNewProfileName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (profile: Profile) => {
    setEditingId(profile.id);
    setEditingName(profile.name);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setError(null);
  };

  const handleSaveEdit = async (profileId: string) => {
    const name = editingName.trim();
    if (!name) return;

    setLoading(true);
    setError(null);

    try {
      const updated = await updateProfile(account, profileId, name);
      onAccountChange(updated);
      setEditingId(null);
      setEditingName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (profileId: string) => {
    if (account.profiles.length <= 1) {
      setError("Cannot delete the last profile");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const updated = await deleteProfile(account, profileId);
      onAccountChange(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl p-6 w-full max-w-md mx-4 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-white"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <h2 className="text-xl font-semibold text-white mb-4">
          Manage Profiles
        </h2>

        <p className="text-slate-400 text-sm mb-4">
          Each profile has its own race history and appears separately on
          leaderboards.
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Existing profiles */}
        <div className="space-y-2 mb-4">
          {account.profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {profile.name.charAt(0).toUpperCase()}
              </div>

              {editingId === profile.id ? (
                <>
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    maxLength={20}
                    autoFocus
                    className="flex-1 bg-slate-700 text-white px-2 py-1 rounded border border-slate-600 focus:border-blue-500 focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit(profile.id);
                      if (e.key === "Escape") handleCancelEdit();
                    }}
                  />
                  <button
                    onClick={() => handleSaveEdit(profile.id)}
                    disabled={loading}
                    className="text-green-400 hover:text-green-300 p-1"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-white truncate">
                    {profile.name}
                  </span>
                  {profile.id === account.activeProfileId && (
                    <span className="text-xs text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded">
                      Active
                    </span>
                  )}
                  <button
                    onClick={() => handleStartEdit(profile)}
                    className="text-slate-400 hover:text-white p-1"
                    title="Rename"
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
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                  {account.profiles.length > 1 && (
                    <button
                      onClick={() => handleDelete(profile.id)}
                      disabled={loading}
                      className="text-slate-400 hover:text-red-400 p-1"
                      title="Delete"
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
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add new profile */}
        <form onSubmit={handleCreateProfile} className="flex gap-2">
          <input
            type="text"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder="New profile name"
            maxLength={20}
            className="flex-1 bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !newProfileName.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-2 rounded-lg font-medium transition-all"
          >
            Add
          </button>
        </form>

        <p className="text-slate-500 text-xs mt-3">
          Maximum 10 profiles per account
        </p>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { fetchAccounts, deleteAccount, type AdminAccount } from "./api";

type Props = {
  sessionToken: string;
  onUnauthorized: () => void;
};

const PAGE_SIZE = 50;

export default function AccountsTab({ sessionToken, onUnauthorized }: Props) {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (off: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAccounts(sessionToken, PAGE_SIZE, off);
      setAccounts(data.accounts);
      setTotal(data.total);
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, onUnauthorized]);

  useEffect(() => {
    load(offset);
  }, [offset, load]);

  const handleDelete = useCallback(async (account: AdminAccount) => {
    if (!confirm(`Delete account "${account.email}"? This will also delete all their profiles and sessions.`)) return;
    try {
      await deleteAccount(sessionToken, account.id);
      load(offset);
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }, [sessionToken, offset, load, onUnauthorized]);

  const hasNext = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold">Accounts ({total})</h2>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-4">
          <span className="w-4 h-4 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
          Loading...
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase tracking-wide border-b border-slate-700">
                  <th className="text-left py-2 px-3">Email</th>
                  <th className="text-left py-2 px-3">Created</th>
                  <th className="text-right py-2 px-3">Profiles</th>
                  <th className="text-right py-2 px-3">Sessions</th>
                  <th className="text-right py-2 px-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-slate-800/50">
                    <td className="py-2 px-3 text-white">{account.email}</td>
                    <td className="py-2 px-3 text-slate-400">
                      {new Date(account.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">{account.profileCount}</td>
                    <td className="py-2 px-3 text-right text-slate-400">{account.sessionCount}</td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => handleDelete(account)}
                        className="text-red-400 hover:text-red-300 text-xs transition-all"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-500">
                      No accounts found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={!hasPrev}
                className="px-3 py-1 text-slate-400 hover:text-white border border-slate-700 rounded disabled:opacity-30 disabled:hover:text-slate-400 transition-all"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={!hasNext}
                className="px-3 py-1 text-slate-400 hover:text-white border border-slate-700 rounded disabled:opacity-30 disabled:hover:text-slate-400 transition-all"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

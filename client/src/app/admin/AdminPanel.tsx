import { useState, useEffect } from "react";
import { type Account } from "../account";
import { verifyEditorAccess } from "../editor/api";
import { type AsyncState, asyncState } from "../state";
import CourseEditor from "../CourseEditor";
import AccountsTab from "./AccountsTab";
import RaceResultsTab from "./RaceResultsTab";

type Tab = "accounts" | "results" | "courses";

type Props = {
  account: Account;
  onBack: () => void;
  onUnauthorized: () => void;
};

export default function AdminPanel({ account, onBack, onUnauthorized }: Props) {
  const [accessState, setAccessState] = useState<AsyncState<void>>(asyncState.loading());
  const [tab, setTab] = useState<Tab>("accounts");

  const sessionToken = account.sessionToken;

  // Verify admin access on mount
  useEffect(() => {
    verifyEditorAccess(sessionToken).then((ok) => {
      if (ok) {
        setAccessState(asyncState.success(undefined));
      } else {
        setAccessState(asyncState.error("Unauthorized"));
        onUnauthorized();
      }
    });
  }, [sessionToken, onUnauthorized]);

  if (accessState.status === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
        <div className="text-slate-400">Verifying access...</div>
      </div>
    );
  }

  if (accessState.status === "error") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 w-80 text-center">
          <p className="text-red-400 mb-4">You don't have admin access.</p>
          <button
            onClick={onBack}
            className="text-sm text-slate-400 hover:text-white py-2 px-4 border border-slate-700 rounded transition-all"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "accounts", label: "Accounts" },
    { key: "results", label: "Race Results" },
    { key: "courses", label: "Courses" },
  ];

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-6">
          <h1 className="text-white font-semibold">Admin</h1>
          <div className="flex gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded text-sm transition-all ${
                  tab === t.key
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-white transition-all"
        >
          Back to Race
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === "accounts" && (
          <AccountsTab
            sessionToken={sessionToken}
            onUnauthorized={onUnauthorized}
          />
        )}
        {tab === "results" && (
          <RaceResultsTab
            sessionToken={sessionToken}
            onUnauthorized={onUnauthorized}
          />
        )}
        {tab === "courses" && (
          <CourseEditor
            account={account}
            onBack={onBack}
            onUnauthorized={onUnauthorized}
            embedded
          />
        )}
      </div>
    </div>
  );
}

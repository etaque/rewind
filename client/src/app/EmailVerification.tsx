import { useState } from "react";
import { isVerified, getVerifiedEmail, maskEmail, clearAuth } from "./auth";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

type Status = "idle" | "loading" | "success" | "error";

type Props = {
  playerName?: string;
  onVerified?: () => void;
};

export default function EmailVerification({ playerName, onVerified }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const verified = isVerified();
  const verifiedEmail = getVerifiedEmail();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes("@")) {
      setErrorMessage("Please enter a valid email address");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch(`${serverUrl}/auth/request-verification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          name: playerName || null,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to send verification email");
      }

      setStatus("success");
      onVerified?.();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to send verification email"
      );
      setStatus("error");
    }
  };

  const handleLogout = () => {
    clearAuth();
    setStatus("idle");
    setEmail("");
    window.location.reload();
  };

  // Already verified - show status
  if (verified && verifiedEmail) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-green-400 text-lg">&#10003;</span>
          <span className="text-slate-300 text-sm">
            Verified as <span className="text-white">{maskEmail(verifiedEmail)}</span>
          </span>
        </div>
        <p className="text-slate-500 text-xs">
          Your race results will be saved to the Hall of Fame.
        </p>
        <button
          onClick={handleLogout}
          className="text-slate-500 hover:text-slate-400 text-xs underline"
        >
          Use different email
        </button>
      </div>
    );
  }

  // Success state - email sent
  if (status === "success") {
    return (
      <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-lg">&#9993;</span>
          <span className="text-white text-sm">Check your inbox</span>
        </div>
        <p className="text-slate-400 text-xs">
          We sent a verification link to <span className="text-white">{email}</span>.
          Click the link to verify your email.
        </p>
        <button
          onClick={() => {
            setStatus("idle");
            setEmail("");
          }}
          className="text-slate-500 hover:text-slate-400 text-xs underline"
        >
          Use different email
        </button>
      </div>
    );
  }

  // Not verified - show form
  return (
    <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
      <div className="space-y-1">
        <h3 className="text-amber-400 text-sm font-medium">
          Link your email to save results
        </h3>
        <p className="text-slate-500 text-xs">
          Verify your email to have your race times saved to the Hall of Fame.
          You can still race anonymously.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          disabled={status === "loading"}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-50"
        />

        {status === "error" && (
          <p className="text-red-400 text-xs">{errorMessage}</p>
        )}

        <button
          type="submit"
          disabled={status === "loading" || !email}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-medium rounded-lg px-4 py-2 text-sm transition-colors"
        >
          {status === "loading" ? "Sending..." : "Send verification link"}
        </button>
      </form>
    </div>
  );
}

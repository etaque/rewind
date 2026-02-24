import { useState, useRef, useEffect } from "react";
import { startAuth, verifyAuth, Account } from "./account";

type Step = "email" | "code";

type AuthModalProps = {
  onClose: () => void;
  onSuccess: (account: Account) => void;
};

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first code input when switching to code step
  useEffect(() => {
    if (step === "code") {
      codeInputRefs.current[0]?.focus();
    }
  }, [step]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await startAuth(trimmedEmail);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    // Only allow single digit
    const digit = value.replace(/\D/g, "").slice(-1);

    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    // Auto-advance to next input
    if (digit && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (digit && index === 5 && newCode.every((d) => d)) {
      handleCodeSubmit(newCode.join(""));
    }
  };

  const handleCodeKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split("");
      setCode(newCode);
      handleCodeSubmit(pasted);
    }
  };

  const handleCodeSubmit = async (fullCode: string) => {
    setLoading(true);
    setError(null);

    try {
      const account = await verifyAuth(email, fullCode);
      onSuccess(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      setCode(["", "", "", "", "", ""]);
      codeInputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    setError(null);

    try {
      await startAuth(email);
      setCode(["", "", "", "", "", ""]);
      codeInputRefs.current[0]?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl p-6 w-full max-w-sm mx-4 relative">
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

        <h2 className="text-xl font-semibold text-white mb-2">
          {step === "email" ? "Sign In" : "Enter Code"}
        </h2>

        {step === "email" ? (
          <>
            <p className="text-slate-400 text-sm mb-4">
              Enter your email to sign in or create an account.
            </p>

            <form onSubmit={handleEmailSubmit}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoFocus
                className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none mb-4"
              />

              {error && (
                <p className="text-red-400 text-sm mb-4">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white py-3 rounded-lg font-medium transition-all"
              >
                {loading ? "Sending..." : "Continue"}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="text-slate-400 text-sm mb-4">
              We sent a 6-digit code to{" "}
              <span className="text-white">{email}</span>
            </p>

            <div
              className="flex gap-2 justify-center mb-4"
              onPaste={handleCodePaste}
            >
              {code.map((digit, i) => (
                <input
                  key={`code-${i}`}
                  ref={(el) => { codeInputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(i, e)}
                  disabled={loading}
                  className="w-11 h-14 bg-slate-800 text-white text-center text-2xl font-mono rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
                />
              ))}
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center mb-4">{error}</p>
            )}

            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-slate-500">Didn't get the code?</span>
              <button
                onClick={handleResendCode}
                disabled={loading}
                className="text-blue-400 hover:text-blue-300 disabled:text-slate-600"
              >
                Resend
              </button>
            </div>

            <button
              onClick={() => {
                setStep("email");
                setError(null);
                setCode(["", "", "", "", "", ""]);
              }}
              className="w-full text-slate-500 hover:text-slate-300 mt-4 text-sm"
            >
              Use different email
            </button>
          </>
        )}
      </div>
    </div>
  );
}

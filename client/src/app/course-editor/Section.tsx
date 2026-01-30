import { useState, ReactNode } from "react";

type Props = {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export default function Section({ label, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-700 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
      >
        {label}
        <span className="text-slate-500">{open ? "\u25B2" : "\u25BC"}</span>
      </button>
      {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  );
}

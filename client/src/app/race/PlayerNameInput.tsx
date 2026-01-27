type Props = {
  value: string;
  onChange: (name: string) => void;
};

export default function PlayerNameInput({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="text-slate-400 text-sm">Your Name</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your name"
        maxLength={20}
        className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}

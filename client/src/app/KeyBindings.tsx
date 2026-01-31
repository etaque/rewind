export default function KeyBindings() {
  const bindings = [
    { key: "\u2190 \u2192", action: "Turn" },
    { key: "Space", action: "Tack" },
    { key: "Enter", action: "Lock TWA" },
    { key: "\u2191", action: "Upwind VMG" },
    { key: "\u2193", action: "Downwind VMG" },
  ];

  return (
    <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-2 rounded-lg font-mono text-xs">
      <div className="flex flex-col gap-0.5">
        {bindings.map(({ key, action }) => (
          <div key={key} className="flex gap-2">
            <span className="text-gray-400 w-12 text-right">{key}</span>
            <span>{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type Props = {
  onStart: () => void;
};

export default function StartScreen({ onStart }: Props) {
  return (
    <div className="fixed inset-0 flex flex-col space-y-4 items-center justify-center bg-black bg-opacity-10">
      <h1 className="logo">Re:wind</h1>
      <button className="btn-start" onClick={onStart}>
        <RewindIcon />
      </button>
    </div>
  );
}

function RewindIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
    </svg>
  );
}

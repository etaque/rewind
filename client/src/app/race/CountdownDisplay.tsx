type Props = {
  countdown: number;
};

export default function CountdownDisplay({ countdown }: Props) {
  return (
    <div className="text-center space-y-4">
      <h2 className="text-white text-2xl font-semibold drop-shadow-lg">Race Starting</h2>
      <div className="text-8xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
        {countdown}
      </div>
    </div>
  );
}

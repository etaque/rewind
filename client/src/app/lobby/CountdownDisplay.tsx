type Props = {
  countdown: number;
};

export default function CountdownDisplay({ countdown }: Props) {
  return (
    <div className="text-center space-y-4">
      <h2 className="text-white text-2xl font-semibold">Race Starting</h2>
      <div className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">
        {countdown}
      </div>
    </div>
  );
}

type Props = {
  finishTime: number;
  courseStartTime: number;
};

export default function FinishOverlay({ finishTime, courseStartTime }: Props) {
  const elapsedMs = finishTime - courseStartTime;
  const days = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor(
    (elapsedMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000),
  );
  const minutes = Math.floor((elapsedMs % (60 * 60 * 1000)) / (60 * 1000));

  return (
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white px-8 py-6 rounded-lg text-center pointer-events-auto">
      <h2 className="text-3xl font-bold text-green-400 mb-4">FINISHED!</h2>
      <p className="text-xl">
        Race Time: {days > 0 ? `${days}d ` : ""}
        {hours}h {minutes}m
      </p>
      <p className="text-gray-400 mt-2 text-sm">
        Race continues for other players...
      </p>
    </div>
  );
}

import { formatDuration } from "../utils";

type Props = {
  courseTime: number;
  startTime: number;
};

export default function RaceTimer({ courseTime, startTime }: Props) {
  const duration = courseTime - startTime;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded-lg font-mono text-lg">
      {formatDuration(duration)}
    </div>
  );
}

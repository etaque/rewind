import { useEffect, useState, useRef } from "react";
import { SphereView } from "../sphere";
import { WindSpeed } from "../models";
import { getWindDirection, getWindSpeedKnots } from "../utils";

type Props = {
  sphereView: SphereView | null;
  courseTime: number;
};

type CursorState = {
  x: number;
  y: number;
  wind: WindSpeed | null;
};

export default function CursorWind({ sphereView, courseTime }: Props) {
  const [cursor, setCursor] = useState<CursorState | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingUpdate = useRef<{ x: number; y: number } | null>(null);
  const courseTimeRef = useRef(courseTime);
  courseTimeRef.current = courseTime;

  useEffect(() => {
    if (!sphereView) return;

    const processUpdate = () => {
      if (pendingUpdate.current && sphereView) {
        const { x, y } = pendingUpdate.current;
        const wind = sphereView.getWindAtScreen(x, y, courseTimeRef.current);
        setCursor({ x, y, wind });
        pendingUpdate.current = null;
      }
      rafRef.current = null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      pendingUpdate.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(processUpdate);
      }
    };

    const handleMouseLeave = () => {
      setCursor(null);
      pendingUpdate.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [sphereView]);

  if (!cursor || !cursor.wind) return null;

  const knots = getWindSpeedKnots(cursor.wind);
  const dir = getWindDirection(cursor.wind);

  return (
    <div
      className="fixed pointer-events-none bg-black/70 text-white px-2 py-1 rounded text-xs font-mono"
      style={{
        left: cursor.x + 16,
        top: cursor.y + 16,
      }}
    >
      {knots.toFixed(1)}kts {dir.toFixed(0)}°
    </div>
  );
}

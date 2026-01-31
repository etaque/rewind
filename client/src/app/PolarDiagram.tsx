import React, { useMemo } from "react";
import { getPolarCurve, getMaxPolarSpeed, PolarData } from "./polar";

type PolarDiagramProps = {
  polar: PolarData;
  tws: number; // True Wind Speed in knots
  twa: number; // True Wind Angle (0-180)
  bsp: number; // Current Boat Speed in knots
};

const WIDTH = 120;
const HEIGHT = 180;
const PADDING = 25;
const RADIUS = (HEIGHT - PADDING * 2) / 2;
const CENTER_X = PADDING;
const CENTER_Y = HEIGHT / 2;

export default React.memo(function PolarDiagram({
  polar,
  tws,
  twa,
  bsp,
}: PolarDiagramProps) {
  // Round TWS to reduce curve recalculations
  const roundedTws = Math.round(tws);

  // Memoize polar curve computation (only recompute when TWS or polar changes)
  const polarCurve = useMemo(
    () => getPolarCurve(polar, roundedTws),
    [polar, roundedTws],
  );
  const maxSpeed = useMemo(() => getMaxPolarSpeed(polar), [polar]);

  // Scale function: BSP -> radius
  const scale = (speed: number) => (speed / maxSpeed) * RADIUS;

  // Convert polar point (twa, bsp) to cartesian SVG coordinates
  // TWA 0 = top (into wind), TWA 90 = right, TWA 180 = bottom
  const polarToCartesian = (twaAngle: number, speed: number) => {
    const r = scale(speed);
    const angle = (twaAngle - 90) * (Math.PI / 180); // Rotate so 0 is up
    return {
      x: CENTER_X + r * Math.cos(angle),
      y: CENTER_Y + r * Math.sin(angle),
    };
  };

  // Generate SVG path for polar curve (starboard side: TWA 0 to 180)
  const pathData = polarCurve
    .map((point, i) => {
      const { x, y } = polarToCartesian(point.twa, point.bsp);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  // Current position marker
  const currentPos = polarToCartesian(twa, bsp);

  // Grid circles at 10 and 20 knots
  const gridSpeeds = [10, 20];

  return (
    <div className="absolute bottom-4 left-4 bg-black/60 rounded-lg p-2">
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="text-white"
      >
        {/* Grid semicircles for speed scale */}
        <g stroke="currentColor" strokeOpacity={0.2} fill="none">
          {gridSpeeds.map((speed) => {
            const r = scale(speed);
            return (
              <path
                key={speed}
                d={`M ${CENTER_X} ${CENTER_Y - r} A ${r} ${r} 0 0 1 ${CENTER_X} ${CENTER_Y + r}`}
              />
            );
          })}
        </g>

        {/* Radial lines for TWA reference */}
        <g stroke="currentColor" strokeOpacity={0.2}>
          {/* 0 degrees (upwind) */}
          <line x1={CENTER_X} y1={CENTER_Y} x2={CENTER_X} y2={PADDING} />
          {/* 90 degrees (beam reach) */}
          <line
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={CENTER_X + RADIUS}
            y2={CENTER_Y}
          />
          {/* 180 degrees (downwind) */}
          <line
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={CENTER_X}
            y2={HEIGHT - PADDING}
          />
        </g>

        {/* Polar curve */}
        <path
          d={pathData}
          fill="none"
          stroke="#22d3ee"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Line from center to current position */}
        <line
          x1={CENTER_X}
          y1={CENTER_Y}
          x2={currentPos.x}
          y2={currentPos.y}
          stroke="#f472b6"
          strokeWidth={1}
          strokeDasharray="2,2"
        />

        {/* Current position marker */}
        <circle
          cx={currentPos.x}
          cy={currentPos.y}
          r={5}
          fill="#f472b6"
          stroke="white"
          strokeWidth={1}
        />

        {/* TWA labels */}
        <g
          fill="#9ca3af"
          fontSize={10}
          fontFamily="monospace"
          textAnchor="middle"
        >
          <text x={CENTER_X} y={12}>
            0
          </text>
          <text x={CENTER_X + RADIUS + 15} y={CENTER_Y + 4}>
            90
          </text>
          <text x={CENTER_X} y={HEIGHT - 4}>
            180
          </text>
        </g>
      </svg>
    </div>
  );
});

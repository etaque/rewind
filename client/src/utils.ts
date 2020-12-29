export function toRadians(d: number): number {
  return d < 0
    ? (Math.abs(d) * Math.PI) / 180
    : Math.PI + ((180 - d) * Math.PI) / 180;
}

/* from https://github.com/cambecc/earth/blob/master/public/libs/earth/1.0.0/micro.js */

export function distance(a: [number, number], b: [number, number]): number {
  var Δx = b[0] - a[0];
  var Δy = b[1] - a[1];
  return Math.sqrt(Δx * Δx + Δy * Δy);
}

export function clamp(x: number, low: number, high: number): number {
  return Math.max(low, Math.min(x, high));
}

export type Color = [number, number, number, number];

export function colorInterpolator(start: Color, end: Color) {
  var r = start[0],
    g = start[1],
    b = start[2];
  var Δr = end[0] - r,
    Δg = end[1] - g,
    Δb = end[2] - b;
  return function (i: number, opacity: number) {
    return [
      Math.floor(r + i * Δr),
      Math.floor(g + i * Δg),
      Math.floor(b + i * Δb),
      opacity,
    ];
  };
}

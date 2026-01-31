export function catmullRomPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 *
      (2 * p1[0] +
        (-p0[0] + p2[0]) * t +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 *
      (2 * p1[1] +
        (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

export function catmullRomSpline(
  points: [number, number][],
  segments: number,
): [number, number][] {
  // Duplicate first and last points for endpoint tangents
  const ext = [points[0], ...points, points[points.length - 1]];
  const result: [number, number][] = [];

  for (let i = 1; i < ext.length - 2; i++) {
    for (let j = 0; j < segments; j++) {
      result.push(
        catmullRomPoint(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], j / segments),
      );
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

export function catmullRomSplineGeo(
  points: [number, number][],
  segments: number,
): [number, number][] {
  // Unwrap longitudes so consecutive values don't jump > 180°
  const unwrapped: [number, number][] = points.map(
    (p) => [...p] as [number, number],
  );
  for (let i = 1; i < unwrapped.length; i++) {
    while (unwrapped[i][0] - unwrapped[i - 1][0] > 180) unwrapped[i][0] -= 360;
    while (unwrapped[i][0] - unwrapped[i - 1][0] < -180)
      unwrapped[i][0] += 360;
  }

  const splined = catmullRomSpline(unwrapped, segments);

  // Normalize longitudes back to [-180, 180]
  for (const p of splined) {
    while (p[0] > 180) p[0] -= 360;
    while (p[0] < -180) p[0] += 360;
  }
  return splined;
}

import { Pixel, WindSpeed } from "./models";

/**
 * Format a duration in milliseconds as "14d 06:37" or "06:37".
 */
export const formatDuration = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const hhmm = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return days > 0 ? `${days}d ${hhmm}` : hhmm;
};

// Conversion factor: m/s to knots
export const MS_TO_KNOTS = 1.944;

/**
 * Convert wind speed from m/s to knots.
 */
export const msToKnots = (ms: number): number => ms * MS_TO_KNOTS;

/**
 * Calculate wind direction in degrees (meteorological convention: where wind comes FROM).
 * Returns value in range [0, 360).
 */
export const getWindDirection = (windSpeed: WindSpeed): number => {
  const radians = Math.atan2(-windSpeed.u, -windSpeed.v);
  return ((radians * 180) / Math.PI + 360) % 360;
};

/**
 * Calculate wind speed magnitude in m/s.
 */
export const getWindSpeed = (windSpeed: WindSpeed): number =>
  Math.sqrt(windSpeed.u ** 2 + windSpeed.v ** 2);

/**
 * Calculate wind speed magnitude in knots.
 */
export const getWindSpeedKnots = (windSpeed: WindSpeed): number =>
  msToKnots(getWindSpeed(windSpeed));

/**
 * Convert degrees to radians for projection rotation.
 */
export const toRadians = (d: number): number =>
  d < 0 ? (Math.abs(d) * Math.PI) / 180 : Math.PI + ((180 - d) * Math.PI) / 180;

export const reframeLongitude = (lng: number): number =>
  lng > 180 ? lng - 360 : lng < -180 ? lng + 360 : lng;

export const clamp = (x: number, low: number, high: number): number =>
  Math.max(low, Math.min(x, high));

export const lngOneDegToM = (lat: number): number =>
  (Math.PI / 180) * 6378137 * Math.cos(lat * (Math.PI / 180));

export const latOneDegToM = 111000;

export const bilinear = ({ x, y }: Pixel, f: (p: Pixel) => number): number => {
  const xf = Math.floor(x);
  const xc = Math.ceil(x);

  const yf = Math.floor(y);
  const yc = Math.ceil(y);

  const g1 = f({ x: xf, y: yf });
  const g2 = f({ x: xc, y: yf });
  const g3 = f({ x: xf, y: yc });
  const g4 = f({ x: xc, y: yc });

  let ia: number, ib: number;

  if (xf == xc) {
    ia = g1;
    ib = g3;
  } else {
    ia = g1 * (xc - x) + g2 * (x - xf);
    ib = g3 * (xc - x) + g4 * (x - xf);
  }

  if (yf == yc) {
    return (ia + ib) / 2;
  } else {
    return ia * (yc - y) + ib * (y - yf);
  }
};

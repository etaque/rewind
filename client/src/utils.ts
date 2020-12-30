import { Pixel } from "./models";

export const toRadians = (d: number): number =>
  d < 0 ? (Math.abs(d) * Math.PI) / 180 : Math.PI + ((180 - d) * Math.PI) / 180;

export const reframeLongitude = (lng: number): number =>
  lng > 180 ? lng - 360 : lng < -180 ? lng + 360 : lng;

export const clamp = (x: number, low: number, high: number): number =>
  Math.max(low, Math.min(x, high));

export const lngOneDegToM = (lat: number): number =>
  (Math.PI / 180) * 6378137 * Math.cos(lat * (Math.PI / 180));

export const latOneDegToM = 111000;

export const roundPixel = ({ x, y }: Pixel): Pixel => ({
  x: Math.round(x),
  y: Math.round(y),
});

export const roundHalf = (n: number): number => Math.round(n * 2) / 2;

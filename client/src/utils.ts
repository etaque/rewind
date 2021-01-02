import { Pixel, Spherical, WindSpeed, LngLat } from "./models";

export const toRadians = (d: number): number =>
  d < 0 ? (Math.abs(d) * Math.PI) / 180 : Math.PI + ((180 - d) * Math.PI) / 180;

export const sphericalToRadians = ([l, p, g]: Spherical): Spherical => [
  toRadians(l),
  toRadians(p),
  toRadians(g),
];

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

export const speed = ({ u, v }: WindSpeed): number =>
  Math.sqrt(u ** 2 + v ** 2);

export const roundHalf = (n: number): number => Math.round(n * 2) / 2;

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

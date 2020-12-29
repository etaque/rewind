import { PackerOptions, PNG } from "pngjs";
import { LngLat, WindSpeed, GenericWindRaster } from "./models";

const serverUrl = process.env.REWIND_SERVER_URL!;

const pixelWidth = 720;
const windScale = 30;
const pixelSize = 0.5; // 1px == 0.5°
const latAmplitude = 160;
export const channels = 4;

type Pixel = { x: number; y: number };

export type WindRaster = PNG;

const parsePNG = (buf: ArrayBuffer, options: PackerOptions): Promise<PNG> =>
  new Promise((resolve, reject) =>
    new PNG(options).parse(Buffer.from(buf), (error, data) => {
      if (error) {
        reject(error);
      } else {
        resolve(data);
      }
    })
  );

export async function load(
  reportId: string,
  facet: string
): Promise<WindRaster> {
  const data = await fetch(
    `${serverUrl}/wind-reports/${reportId}/${facet}.png`
  );
  const blob = await data.blob();

  const buf = await blob.arrayBuffer();
  return parsePNG(buf, { colorType: 2 });
}

export function speedAt(png: WindRaster, position: LngLat): WindSpeed {
  const px = roundPixel(posToPixel(position));
  const idx = pixelToIndex(px);
  const u = colorToSpeed(png.data[idx]);
  const v = colorToSpeed(png.data[idx + 1]);
  return { u, v };
}

export function positionOfIndex(idx: number): LngLat {
  return pixelToPos(indexToPixel(idx));
}

function indexToPixel(idx: number): Pixel {
  return { x: (idx / channels) % pixelWidth, y: idx / channels / pixelWidth };
}

function pixelToIndex({ x, y }: Pixel): number {
  return (pixelWidth * y + x) * channels;
}

function posToPixel({ lng, lat }: LngLat): Pixel {
  return {
    x: (lng + 180) / pixelSize,
    y: (lat + latAmplitude / 2) / pixelSize,
  };
}

function pixelToPos({ x, y }: Pixel): LngLat {
  const lng = roundHalf(x * pixelSize - 180);
  const lat = roundHalf(y * pixelSize - latAmplitude / 2);
  return {
    lng: lng > 180 ? lng - 360 : lng,
    lat,
  };
}

// From [0..255] to +/-30 in m/s, inverse of ST_Reclass in server.
export function colorToSpeed(n: number): number {
  return (n * windScale * 2) / 255 - windScale;
}

function roundPixel({ x, y }: Pixel): Pixel {
  return { x: Math.round(x), y: Math.round(y) };
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export default { load, speedAt } as GenericWindRaster<PNG>;

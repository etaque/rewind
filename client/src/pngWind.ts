import { PackerOptions, PNG } from "pngjs";
import { LngLat, WindSpeed, GenericWindRaster } from "./models";

const serverUrl = process.env.REWIND_SERVER_URL!;

const width = 720;
const windScale = 30;
const pixelSize = 0.5; // 1px == 0.5°

type Pixel = { x: number; y: number };

export type WindRaster = PNG;

function toFloatingPixel({ lng, lat }: LngLat): Pixel {
  return {
    x: (lng + 180) / pixelSize,
    y: (lat + 90) / pixelSize,
  };
}

// From [0..255] to +/-30 in m/s, inverse of ST_Reclass in server.
function colorToSpeed(n: number): number {
  return (n * windScale * 2) / 255 - windScale;
}

function round({ x, y }: Pixel): Pixel {
  return { x: Math.round(x), y: Math.round(y) };
}

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

export async function load(reportId: string): Promise<WindRaster> {
  const data = await fetch(`${serverUrl}/wind-reports/${reportId}/uv.png`);
  const blob = await data.blob();

  const buf = await blob.arrayBuffer();
  return parsePNG(buf, { colorType: 2 });
}

export function speedAt(png: WindRaster, position: LngLat): WindSpeed {
  const { x, y } = round(toFloatingPixel(position));
  const idx = (width * y + x) * 3;
  const u = colorToSpeed(png.data[idx]);
  const v = colorToSpeed(png.data[idx + 1]);
  console.log(u, v);
  return { u, v };
}

export default { load, speedAt } as GenericWindRaster<PNG>;

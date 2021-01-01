import { PackerOptions, PNG } from "pngjs";
import { LngLat, WindSpeed, Pixel } from "./models";
import { bilinear } from "./utils";

const serverUrl = process.env.REWIND_SERVER_URL!;

const pixelWidth = 720;
const windScale = 30;
const pixelSize = 0.5; // 1px == 0.5°
const latAmplitude = 160;
export const channels = 4;

export default class Wind {
  readonly id: string;
  readonly raster: PNG;

  constructor(reportId: string, raster: PNG) {
    this.id = reportId;
    this.raster = raster;
  }

  static async load(reportId: string, facet: string): Promise<Wind> {
    const data = await fetch(
      `${serverUrl}/wind-reports/${reportId}/${facet}.png`
    );
    const blob = await data.blob();

    const buf = await blob.arrayBuffer();
    const png = await parsePNG(buf, { colorType: 2 });

    return new Wind(reportId, png);
  }

  speedAt(position: LngLat): WindSpeed | null {
    const floatingPix = posToPixel(position);
    const vectorGetter = (offset: number) => (p: Pixel) =>
      colorToSpeed(this.raster.data[pixelToIndex(p) + offset]);
    if (floatingPix) {
      return {
        u: bilinear(floatingPix, vectorGetter(0)),
        v: bilinear(floatingPix, vectorGetter(1)),
      };
    } else {
      return null;
    }
  }
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

function pixelToIndex({ x, y }: Pixel): number {
  return (pixelWidth * y + x) * channels;
}

function posToPixel({ lng, lat }: LngLat): Pixel | null {
  if (lat < -latAmplitude || lat > latAmplitude || lng < -180 || lng > 180) {
    return null;
  } else {
    return {
      x: (lng + 180) / pixelSize,
      y: (lat + latAmplitude / 2) / pixelSize,
    };
  }
}

// From [0..255] to +/-30 in m/s, inverse of ST_Reclass in server.
function colorToSpeed(n: number): number {
  return (n * windScale * 2) / 255 - windScale;
}

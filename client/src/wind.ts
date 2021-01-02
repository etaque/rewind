import { PackerOptions, PNG } from "pngjs";
import { LngLat, WindSpeed, Pixel } from "./models";
import * as utils from "./utils";

const serverUrl = process.env.REWIND_SERVER_URL!;

const pixelWidth = 720;
const windScale = 30;
const pixelSize = 0.5; // 1px == 0.5°
const latAmplitude = 180;
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
      colorToSpeed(
        this.raster.data[pixelToIndex(reframePixel(p, pixelWidth)) + offset]
      );
    if (floatingPix) {
      return {
        u: utils.bilinear(floatingPix, vectorGetter(0)),
        v: utils.bilinear(floatingPix, vectorGetter(1)),
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

const pixelToIndex = ({ x, y }: Pixel): number =>
  (pixelWidth * y + x) * channels;

const posToPixel = ({ lng, lat }: LngLat): Pixel | null => {
  if (lat < -latAmplitude || lat > latAmplitude) {
    return null;
  } else {
    return {
      x: toGribLongitude(lng) / pixelSize,
      y: (lat + latAmplitude / 2) / pixelSize,
    };
  }
};

// From [0..255] to +/-30 in m/s, inverse of ST_Reclass in server.
function colorToSpeed(n: number): number {
  return (n * windScale * 2) / 255 - windScale;
}

const reframePixel = ({ x, y }: Pixel, width: number): Pixel => ({
  x: x % width,
  y,
});

const toGribLongitude = (lng: number): number => (lng <= 0 ? lng + 360 : lng);

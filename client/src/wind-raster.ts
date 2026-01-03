import { LngLat, WindSpeed, Pixel } from "./models";
import * as utils from "./utils";

const serverUrl = import.meta.env.REWIND_SERVER_URL;

const pixelWidth = 720;
const windScale = 30;
const pixelSize = 0.5; // 1px == 0.5°
const latAmplitude = 180;
const channels = 4; // RGBA

type RasterData = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export default class WindRaster {
  readonly id: string;
  readonly raster: RasterData;

  constructor(reportId: string, raster: RasterData) {
    this.id = reportId;
    this.raster = raster;
  }

  static async load(reportId: string): Promise<WindRaster> {
    const url = `${serverUrl}/wind-reports/${reportId}/uv.png`;
    const raster = await loadImageData(url);
    return new WindRaster(reportId, raster);
  }

  speedAt(position: LngLat): WindSpeed | null {
    const floatingPix = posToPixel(position);
    const vectorGetter = (offset: number) => (p: Pixel) =>
      colorToSpeed(
        this.raster.data[pixelToIndex(reframePixel(p, pixelWidth)) + offset],
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

async function loadImageData(url: string): Promise<RasterData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      resolve({
        data: imageData.data,
        width: img.width,
        height: img.height,
      });
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

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

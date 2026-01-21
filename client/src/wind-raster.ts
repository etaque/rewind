import { LngLat, WindSpeed, Pixel } from "./models";
import * as utils from "./utils";
import type { WorkerResponse } from "./wind-raster.worker";
import WindRasterWorker from "./wind-raster.worker?worker";

const windScale = 30;
const latAmplitude = 180;
const channels = 4; // RGBA

type RasterData = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

// Compute pixel size (degrees per pixel) from raster dimensions
function getPixelSize(width: number): number {
  // 720px = 0.5° resolution, 1440px = 0.25° resolution
  return 360 / width;
}

export default class WindRaster {
  readonly time: number;
  readonly raster: RasterData;

  constructor(time: number, raster: RasterData) {
    this.time = time;
    this.raster = raster;
  }

  static async load(time: number, pngUrl: string): Promise<WindRaster> {
    const raster = await loadImageData(pngUrl);
    return new WindRaster(time, raster);
  }

  speedAt(position: LngLat): WindSpeed | null {
    const { width } = this.raster;
    const pixelSize = getPixelSize(width);
    const floatingPix = posToPixel(position, pixelSize);
    const vectorGetter = (offset: number) => (p: Pixel) =>
      colorToSpeed(
        this.raster.data[pixelToIndex(reframePixel(p, width), width) + offset],
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

  /** Get the resolution in degrees per pixel */
  get pixelSize(): number {
    return getPixelSize(this.raster.width);
  }

  /** Get the width of the raster in pixels */
  get width(): number {
    return this.raster.width;
  }

  /** Get the height of the raster in pixels */
  get height(): number {
    return this.raster.height;
  }
}

function loadImageData(url: string): Promise<RasterData> {
  return new Promise((resolve, reject) => {
    const worker = new WindRasterWorker();
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (e) => {
      reject(new Error(`Worker error: ${e.message}`));
      worker.terminate();
    };
    worker.postMessage({ url });
  });
}

const pixelToIndex = ({ x, y }: Pixel, width: number): number =>
  (width * y + x) * channels;

const posToPixel = ({ lng, lat }: LngLat, pixelSize: number): Pixel | null => {
  if (lat < -latAmplitude / 2 || lat > latAmplitude / 2) {
    return null;
  } else {
    return {
      x: toGribLongitude(lng) / pixelSize,
      y: (latAmplitude / 2 - lat) / pixelSize,
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

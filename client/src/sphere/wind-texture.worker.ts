export type WorkerRequest = {
  currentRasterData: Uint8ClampedArray;
  currentRasterWidth: number;
  nextRasterData?: Uint8ClampedArray;
  nextRasterWidth?: number;
  interpolationFactor: number; // 0-1, how much to blend toward next
};

export type WorkerResponse = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

const OUTPUT_WIDTH = 4096 / 4;
const OUTPUT_HEIGHT = 2048 / 4;

// Wind raster constants (must match wind-raster.ts)
const WIND_SCALE = 30;
const LAT_AMPLITUDE = 180;
const CHANNELS = 4;

// Compute pixel size (degrees per pixel) from raster dimensions
function getPixelSize(width: number): number {
  // 720px = 0.5° resolution, 1440px = 0.25° resolution
  return 360 / width;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const {
    currentRasterData,
    currentRasterWidth,
    nextRasterData,
    nextRasterWidth,
    interpolationFactor,
  } = e.data;

  const imageData = generateImage(
    currentRasterData,
    currentRasterWidth,
    nextRasterData,
    nextRasterWidth,
    interpolationFactor,
  );

  self.postMessage(
    { data: imageData.data, width: imageData.width, height: imageData.height },
    [imageData.data.buffer],
  );
};

function generateImage(
  currentRasterData: Uint8ClampedArray,
  currentRasterWidth: number,
  nextRasterData?: Uint8ClampedArray,
  nextRasterWidth?: number,
  interpolationFactor: number = 0,
): ImageData {
  const width = OUTPUT_WIDTH;
  const height = OUTPUT_HEIGHT;
  const arraySize = 4 * width * height;
  const canInterpolate =
    nextRasterData && nextRasterWidth && interpolationFactor > 0;

  const data = new Uint8ClampedArray(arraySize);

  let x = 0;
  let y = 0;

  for (let i = 0; i < arraySize; i = i + 4) {
    // Inverse equirectangular projection: screen coords to lng/lat
    const lng = (x / width) * 360 - 180;
    const lat = 90 - (y / height) * 180;

    let windSpeed = speedAt(currentRasterData, currentRasterWidth, lng, lat);

    // Interpolate with next raster if available
    if (canInterpolate && windSpeed) {
      const nextWindSpeed = speedAt(nextRasterData, nextRasterWidth, lng, lat);
      if (nextWindSpeed) {
        windSpeed = {
          u: lerp(windSpeed.u, nextWindSpeed.u, interpolationFactor),
          v: lerp(windSpeed.v, nextWindSpeed.v, interpolationFactor),
        };
      }
    }

    if (windSpeed && !isNaN(windSpeed.u) && !isNaN(windSpeed.v)) {
      const speed = Math.sqrt(windSpeed.u ** 2 + windSpeed.v ** 2);
      const [r, g, b] = windColor(speed);

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 200;
    } else {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }

    if (x < width - 1) {
      x = x + 1;
    } else {
      x = 0;
      y = y + 1;
    }
  }

  return new ImageData(data, width);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Inlined from WindRaster.speedAt
function speedAt(
  rasterData: Uint8ClampedArray,
  rasterWidth: number,
  lng: number,
  lat: number,
): { u: number; v: number } | null {
  const pixelSize = getPixelSize(rasterWidth);
  const floatingPix = posToPixel(lng, lat, pixelSize);
  if (!floatingPix) return null;

  const u = bilinear(floatingPix, (p) =>
    colorToSpeed(
      rasterData[pixelToIndex(reframePixel(p, rasterWidth), rasterWidth) + 0],
    ),
  );
  const v = bilinear(floatingPix, (p) =>
    colorToSpeed(
      rasterData[pixelToIndex(reframePixel(p, rasterWidth), rasterWidth) + 1],
    ),
  );

  return { u, v };
}

function posToPixel(
  lng: number,
  lat: number,
  pixelSize: number,
): { x: number; y: number } | null {
  if (lat < -LAT_AMPLITUDE / 2 || lat > LAT_AMPLITUDE / 2) {
    return null;
  }
  return {
    x: toGribLongitude(lng) / pixelSize,
    y: (LAT_AMPLITUDE / 2 - lat) / pixelSize,
  };
}

function pixelToIndex(
  { x, y }: { x: number; y: number },
  width: number,
): number {
  return (width * y + x) * CHANNELS;
}

function colorToSpeed(n: number): number {
  return (n * WIND_SCALE * 2) / 255 - WIND_SCALE;
}

function reframePixel(
  { x, y }: { x: number; y: number },
  width: number,
): { x: number; y: number } {
  return { x: x % width, y };
}

function toGribLongitude(lng: number): number {
  return lng <= 0 ? lng + 360 : lng;
}

function bilinear(
  { x, y }: { x: number; y: number },
  f: (p: { x: number; y: number }) => number,
): number {
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
}

// HSL to RGB conversion (replaces D3 color scale)
function windColor(speed: number): [number, number, number] {
  let h: number;
  let s = 0.6;
  let l = 0.45;

  if (speed < 8) {
    // Light winds: Blue to green (0-16 knots)
    h = 240 - (speed / 8) * 120;
  } else if (speed < 15) {
    // Moderate winds: Green to yellow (16-30 knots)
    h = 120 - ((speed - 8) / 7) * 60;
  } else if (speed < 25) {
    // Strong winds: Yellow to red (30-50 knots)
    h = 60 - ((speed - 15) / 10) * 60;
  } else if (speed < 35) {
    // Storm winds: Red to pink (50-70 knots)
    h = 360 - ((speed - 25) / 10) * 60;
  } else {
    // Extreme: Pink to white (70+ knots)
    h = 300;
    l = 0.45 + ((speed - 35) / 15) * 0.4;
    if (l > 0.85) l = 0.85;
  }

  return hslToRgb(h, s, l);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h / 360;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

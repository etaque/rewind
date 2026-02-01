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
      data[i + 3] = 140;
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

// OKLab color space for perceptually uniform gradients
type OKLab = { L: number; a: number; b: number };

// Color stops in OKLab space (pre-converted from desired RGB colors)
// Blue (light winds) -> Green -> Yellow -> Red -> Pink -> White (extreme)
const COLOR_STOPS: { speed: number; color: OKLab }[] = [
  { speed: 0, color: { L: 0.55, a: -0.08, b: -0.15 } }, // Blue
  { speed: 8, color: { L: 0.55, a: -0.14, b: 0.1 } }, // Green
  { speed: 15, color: { L: 0.75, a: -0.03, b: 0.16 } }, // Yellow
  { speed: 25, color: { L: 0.55, a: 0.15, b: 0.1 } }, // Red
  { speed: 35, color: { L: 0.65, a: 0.15, b: -0.05 } }, // Pink
  { speed: 45, color: { L: 0.9, a: 0.02, b: -0.02 } }, // Near white
];

function windColor(speed: number): [number, number, number] {
  // Find the two color stops to interpolate between
  let i = 0;
  while (i < COLOR_STOPS.length - 1 && COLOR_STOPS[i + 1].speed < speed) {
    i++;
  }

  if (i >= COLOR_STOPS.length - 1) {
    // Beyond last stop, clamp to last color
    return oklabToRgb(COLOR_STOPS[COLOR_STOPS.length - 1].color);
  }

  const stop0 = COLOR_STOPS[i];
  const stop1 = COLOR_STOPS[i + 1];
  const t = (speed - stop0.speed) / (stop1.speed - stop0.speed);

  // Interpolate in OKLab space
  const color: OKLab = {
    L: stop0.color.L + (stop1.color.L - stop0.color.L) * t,
    a: stop0.color.a + (stop1.color.a - stop0.color.a) * t,
    b: stop0.color.b + (stop1.color.b - stop0.color.b) * t,
  };

  return oklabToRgb(color);
}

// Convert OKLab to linear RGB, then to sRGB
function oklabToRgb(lab: OKLab): [number, number, number] {
  // OKLab -> LMS
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS -> linear RGB
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  // Linear RGB -> sRGB (gamma correction)
  const r = Math.round(linearToSrgb(lr) * 255);
  const g = Math.round(linearToSrgb(lg) * 255);
  const b = Math.round(linearToSrgb(lb) * 255);

  return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
}

function linearToSrgb(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

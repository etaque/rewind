export type WorkerRequest = {
  rasterData: Uint8ClampedArray;
  rasterWidth: number;
  rasterHeight: number;
};

export type WorkerResponse = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

const OUTPUT_WIDTH = 4096 / 4;
const OUTPUT_HEIGHT = 2048 / 4;

// Wind raster constants (must match wind-raster.ts)
const RASTER_PIXEL_WIDTH = 720;
const WIND_SCALE = 30;
const PIXEL_SIZE = 0.5;
const LAT_AMPLITUDE = 180;
const CHANNELS = 4;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { rasterData, rasterWidth } = e.data;
  const imageData = generateImage(rasterData, rasterWidth);

  self.postMessage(
    { data: imageData.data, width: imageData.width, height: imageData.height },
    [imageData.data.buffer],
  );
};

function generateImage(
  rasterData: Uint8ClampedArray,
  rasterWidth: number,
): ImageData {
  const width = OUTPUT_WIDTH;
  const height = OUTPUT_HEIGHT;
  const arraySize = 4 * width * height;

  const data = new Uint8ClampedArray(arraySize);

  let x = 0;
  let y = 0;

  for (let i = 0; i < arraySize; i = i + 4) {
    // Inverse equirectangular projection: screen coords to lng/lat
    const lng = (x / width) * 360 - 180;
    const lat = 90 - (y / height) * 180;

    const windSpeed = speedAt(rasterData, rasterWidth, lng, lat);

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

// Inlined from WindRaster.speedAt
function speedAt(
  rasterData: Uint8ClampedArray,
  rasterWidth: number,
  lng: number,
  lat: number,
): { u: number; v: number } | null {
  const floatingPix = posToPixel(lng, lat);
  if (!floatingPix) return null;

  const u = bilinear(floatingPix, (p) =>
    colorToSpeed(
      rasterData[pixelToIndex(reframePixel(p, rasterWidth)) + 0],
    ),
  );
  const v = bilinear(floatingPix, (p) =>
    colorToSpeed(
      rasterData[pixelToIndex(reframePixel(p, rasterWidth)) + 1],
    ),
  );

  return { u, v };
}

function posToPixel(
  lng: number,
  lat: number,
): { x: number; y: number } | null {
  if (lat < -LAT_AMPLITUDE || lat > LAT_AMPLITUDE) {
    return null;
  }
  return {
    x: toGribLongitude(lng) / PIXEL_SIZE,
    y: (lat + LAT_AMPLITUDE / 2) / PIXEL_SIZE,
  };
}

function pixelToIndex({ x, y }: { x: number; y: number }): number {
  return (RASTER_PIXEL_WIDTH * y + x) * CHANNELS;
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
  let s = 1;
  let l = 0.5;

  if (speed < 35) {
    // Blue to green
    h = 240 - (speed / 35) * 120;
  } else if (speed < 70) {
    // Green to red
    h = 120 - ((speed - 35) / 35) * 120;
  } else if (speed < 100) {
    // Red to pink
    h = 360 - ((speed - 70) / 30) * 60;
  } else {
    // Pink to white
    h = 300;
    l = 0.5 + ((speed - 100) / 100) * 0.5;
    if (l > 1) l = 1;
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

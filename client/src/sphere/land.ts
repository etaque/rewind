import * as topojson from "topojson-client";
import * as d3 from "d3";
import { Topology } from "topojson-specification";
import { Scene } from "./scene";

const LOW_RES_PATH = "/sphere/land-110m.json";
const HIGH_RES_PATH = "/sphere/land-50m.json";

// Scale factor threshold for high-res (relative to base scale of 500)
const HIGH_RES_SCALE_THRESHOLD = 2.0;
const BASE_SCALE = 500;

export default class Land {
  canvas: HTMLCanvasElement;
  private lowRes?: d3.GeoPermissibleObjects;
  private highRes?: d3.GeoPermissibleObjects;
  private lowResPromise?: Promise<d3.GeoPermissibleObjects>;
  private highResPromise?: Promise<d3.GeoPermissibleObjects>;

  // Cache for rendered land
  private cache: HTMLCanvasElement;
  private cacheCtx: CanvasRenderingContext2D;
  private cacheValid = false;
  private lastRotation?: [number, number, number];
  private lastScale?: number;
  private lastDpr?: number;
  private lastResolution?: "low" | "high";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.cache = document.createElement("canvas");
    this.cache.width = canvas.width;
    this.cache.height = canvas.height;
    this.cacheCtx = this.cache.getContext("2d")!;
  }

  private isDirty(scene: Scene, resolution: "low" | "high"): boolean {
    if (!this.cacheValid) return true;

    const rotation = scene.projection.rotate();
    const scale = scene.projection.scale();

    if (
      this.lastRotation &&
      this.lastScale === scale &&
      this.lastDpr === scene.dpr &&
      this.lastResolution === resolution &&
      rotation[0] === this.lastRotation[0] &&
      rotation[1] === this.lastRotation[1] &&
      rotation[2] === this.lastRotation[2]
    ) {
      return false;
    }

    this.lastRotation = [rotation[0], rotation[1], rotation[2]];
    this.lastScale = scale;
    this.lastDpr = scene.dpr;
    this.lastResolution = resolution;
    return true;
  }

  private resizeCacheIfNeeded() {
    if (
      this.cache.width !== this.canvas.width ||
      this.cache.height !== this.canvas.height
    ) {
      this.cache.width = this.canvas.width;
      this.cache.height = this.canvas.height;
      // Force re-render after resize
      this.cacheValid = false;
    }
  }

  async render(scene: Scene, moving: boolean) {
    // Load low-res immediately (required for first render)
    if (!this.lowRes) {
      this.lowResPromise ??= getLand(LOW_RES_PATH);
      this.lowRes = await this.lowResPromise;
    }

    // Determine desired resolution
    const scaleFactor = scene.projection.scale() / BASE_SCALE;
    const wantHighRes = !moving && scaleFactor >= HIGH_RES_SCALE_THRESHOLD;

    // Lazy-load high-res in background when first needed
    if (wantHighRes && !this.highRes && !this.highResPromise) {
      this.highResPromise = getLand(HIGH_RES_PATH);
      this.highResPromise.then((data) => {
        this.highRes = data;
      });
    }

    // Use high-res if available and wanted, otherwise low-res
    const resolution: "low" | "high" =
      wantHighRes && this.highRes ? "high" : "low";
    const land = resolution === "high" ? this.highRes! : this.lowRes;

    this.resizeCacheIfNeeded();
    const context = this.canvas.getContext("2d")!;

    // Always clear visible canvas and apply DPR scale
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Re-render to cache only if projection or resolution changed
    if (this.isDirty(scene, resolution)) {
      this.renderToCache(scene, land);
      this.cacheValid = true;
    }

    // Composite cache to visible canvas
    context.drawImage(this.cache, 0, 0);

    // Apply DPR scale for subsequent overlay renders
    context.scale(scene.dpr, scene.dpr);
  }

  private renderToCache(scene: Scene, land: d3.GeoPermissibleObjects) {
    const ctx = this.cacheCtx;
    const path = d3.geoPath(scene.projection, ctx);
    const graticule = d3.geoGraticule10();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cache.width, this.cache.height);
    ctx.scale(scene.dpr, scene.dpr);

    // Draw land with shadow/glow effect
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.strokeStyle = "rgba(34, 45, 34, 0.3)";
    ctx.beginPath();
    path(land);
    ctx.fill();

    // Reset shadow before stroke to keep coastline crisp
    ctx.shadowBlur = 0;
    ctx.stroke();

    // Draw graticule
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    path(graticule);
    ctx.stroke();
  }
}

async function getLand(path: string): Promise<d3.GeoPermissibleObjects> {
  const world = await d3.json<Topology>(path);
  if (world) return topojson.feature(world, world.objects.land);
  else return Promise.reject("Failed to fetch land at: " + path);
}

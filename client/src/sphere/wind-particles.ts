import { LngLat, Pixel } from "../models";
import { Scene } from "./scene";
import InterpolatedWind from "../interpolated-wind";
import * as utils from "../utils";

const MAX_AGE = 1200;
const PARTICLES_COUNT = 1000;
const TRAVEL_SPEED = 45;
const TRAIL_LENGTH = 25;
const TRAIL_BANDS = 6;
const BASE_SCALE = 500;

type Particle = {
  pix: Pixel;
  coord: LngLat;
  age: number;
  visible: boolean;
  trail: Pixel[];
};

export default class Particles {
  canvas: HTMLCanvasElement;
  particles: Particle[] = [];
  dpr: number;

  rafId?: number;
  paused = false;
  running = false;
  wind?: InterpolatedWind;
  interpolationFactor: number = 0;
  scene?: Scene;

  constructor(canvas: HTMLCanvasElement, dpr: number = 1) {
    this.canvas = canvas;
    this.dpr = dpr;
  }

  show(scene: Scene, wind: InterpolatedWind, interpolationFactor: number) {
    this.wind = wind;
    this.interpolationFactor = interpolationFactor;
    this.scene = scene;

    if (this.running) return;

    this.running = true;
    this.paused = false;
    this.particles = generateParticles(scene);

    const context = this.canvas.getContext("2d")!;
    const dpr = this.dpr;
    let previous: number;

    const tick = (timestamp: number) => {
      if (this.paused || !this.wind || !this.scene) return;

      if (previous) {
        const delta = timestamp - previous;

        // Move all particles (no drawing yet)
        this.particles.forEach((p) =>
          moveParticle(
            p,
            delta,
            this.scene!,
            this.wind!,
            this.interpolationFactor,
          ),
        );

        // Clear canvas entirely — no ghost pixels possible
        context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        context.save();
        context.scale(dpr, dpr);
        context.strokeStyle = "rgb(210,210,210)";
        context.lineWidth = 1.5;

        // Draw trails in banded passes for efficient batched rendering
        for (let b = 0; b < TRAIL_BANDS; b++) {
          const alpha = 0.7 * ((b + 1) / TRAIL_BANDS) ** 2;
          context.globalAlpha = alpha;
          context.beginPath();

          for (const p of this.particles) {
            if (!p.visible || p.trail.length === 0) continue;

            const segStart = Math.floor(
              (b * p.trail.length) / TRAIL_BANDS,
            );
            const segEnd = Math.floor(
              ((b + 1) * p.trail.length) / TRAIL_BANDS,
            );

            for (let i = segStart; i < segEnd; i++) {
              const from = p.trail[i];
              const to =
                i + 1 < p.trail.length ? p.trail[i + 1] : p.pix;
              context.moveTo(from.x, from.y);
              context.lineTo(to.x, to.y);
            }
          }

          context.stroke();
        }

        context.restore();
      }
      previous = timestamp;
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  hide() {
    this.paused = true;
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    const context = this.canvas.getContext("2d")!;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  reset() {
    this.hide();
    this.particles = [];
    this.scene = undefined;
  }
}

/**
 * Generate a random geo coordinate within the visible hemisphere.
 * Uses the current projection center and generates points that will
 * be visible on screen.
 */
function generateRandomVisibleCoord(scene: Scene): LngLat | null {
  const radius = scene.sphereRadius - 1;
  const { width, height } = scene;

  // Generate random point within visible circle on screen
  let pix: Pixel;
  if (radius * 2 > 1.41421 * width) {
    pix = {
      x: Math.random() * (width - 1),
      y: Math.random() * (height - 1),
    };
  } else {
    const randomAngle = Math.random() * 2 * Math.PI;
    const randomRadiusSqrt = Math.random() * radius ** 2;
    pix = {
      x: Math.sqrt(randomRadiusSqrt) * Math.cos(randomAngle) + width / 2,
      y: Math.sqrt(randomRadiusSqrt) * Math.sin(randomAngle) + height / 2,
    };
  }

  // Convert screen position to geo coordinate
  const pos = scene.projection.invert
    ? scene.projection.invert([pix.x, pix.y])
    : null;

  if (!pos) return null;

  let coord: LngLat = { lng: pos[0], lat: pos[1] };
  if (coord.lng > 180) coord.lng = -180 + (coord.lng - 180);

  return coord;
}

/**
 * Generate particles within the visible hemisphere.
 * Particles store geo coordinates so they can be correctly
 * repositioned when the projection rotates.
 */
function generateParticles(scene: Scene): Particle[] {
  const particles: Particle[] = [];

  for (let i = 0; i < PARTICLES_COUNT; i++) {
    const coord = generateRandomVisibleCoord(scene);
    if (!coord) continue;

    const xy = scene.projection([coord.lng, coord.lat]);
    if (xy) {
      particles.push({
        pix: { x: xy[0], y: xy[1] },
        coord: coord,
        age: MAX_AGE * Math.random(),
        visible: true,
        trail: [],
      });
    }
  }

  return particles;
}

/**
 * Check if a screen position is within the visible globe.
 */
function isOnVisibleGlobe(pix: Pixel, scene: Scene): boolean {
  const rx = pix.x - scene.sphereCenter.x;
  const ry = pix.y - scene.sphereCenter.y;
  return rx ** 2 + ry ** 2 < scene.sphereRadius ** 2;
}

function moveParticle(
  p: Particle,
  delta: number,
  scene: Scene,
  wind: InterpolatedWind,
  interpolationFactor: number,
) {
  p.age += delta;

  if (p.age > MAX_AGE) {
    // Respawn at a new random visible location
    const newCoord = generateRandomVisibleCoord(scene);
    if (!newCoord) {
      p.visible = false;
      return;
    }

    p.coord = newCoord;
    p.age = (MAX_AGE * Math.random()) / 4;
    p.trail = [];

    const xy = scene.projection([p.coord.lng, p.coord.lat]);
    if (xy) {
      p.pix = { x: xy[0], y: xy[1] };
      p.visible = isOnVisibleGlobe(p.pix, scene);
    } else {
      p.visible = false;
    }
    return;
  }

  if (!p.visible) return;

  const windSpeed = wind.speedAtWithFactor(p.coord, interpolationFactor);
  if (!windSpeed) {
    p.visible = false;
    return;
  }

  const { u, v } = windSpeed;

  // Scale travel speed inversely with zoom level to keep screen-space velocity constant
  const scale = scene.projection.scale();
  const effectiveSpeed = TRAVEL_SPEED * (BASE_SCALE / scale);

  const lngDeltaDist = u * delta * effectiveSpeed;
  const latDeltaDist = v * delta * effectiveSpeed;

  const lngDeltaDeg = lngDeltaDist / utils.lngOneDegToM(p.coord.lat);
  const latDeltaDeg = latDeltaDist / utils.latOneDegToM;

  p.coord = {
    lng: utils.reframeLongitude(p.coord.lng + lngDeltaDeg),
    lat: p.coord.lat + latDeltaDeg,
  };

  // Check latitude bounds
  if (p.coord.lat > 90 || p.coord.lat < -90) {
    p.visible = false;
    return;
  }

  const xy = scene.projection([p.coord.lng, p.coord.lat]);
  if (!xy) {
    p.visible = false;
    return;
  }

  const newPix = { x: xy[0], y: xy[1] };

  if (!isOnVisibleGlobe(newPix, scene)) {
    p.visible = false;
    return;
  }

  // Record previous position in trail and advance
  p.trail.push(p.pix);
  if (p.trail.length > TRAIL_LENGTH) {
    p.trail.shift();
  }
  p.pix = newPix;
}

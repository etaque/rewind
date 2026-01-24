import { LngLat, Pixel } from "../models";
import { Scene } from "./scene";
import InterpolatedWind from "../interpolated-wind";
import * as utils from "../utils";

const MAX_AGE = 1200;
const PARTICLES_COUNT = 1000;
const ALPHA_DECAY = 0.95;
const TRAVEL_SPEED = 45;
const FPS = 60;

type Particle = {
  pix: Pixel;
  coord: LngLat;
  age: number;
  visible: boolean;
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

        if (delta >= 1000 / FPS) {
          context.save();
          context.scale(dpr, dpr);
          context.beginPath();
          context.strokeStyle = "rgba(210,210,210,0.7)";

          this.particles.forEach((p) =>
            moveParticle(
              p,
              delta,
              context,
              this.scene!,
              this.wind!,
              this.interpolationFactor,
            ),
          );

          context.stroke();
          context.restore();

          context.globalAlpha = ALPHA_DECAY;
          context.globalCompositeOperation = "copy";
          context.drawImage(context.canvas, 0, 0);
          context.globalAlpha = 1.0;
          context.globalCompositeOperation = "source-over";

          previous = timestamp;
        }
      } else {
        previous = timestamp;
      }
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
  context: CanvasRenderingContext2D,
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

  const lngDeltaDist = u * delta * TRAVEL_SPEED;
  const latDeltaDist = v * delta * TRAVEL_SPEED;

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

  // Draw line from previous to new position
  context.moveTo(p.pix.x, p.pix.y);
  context.lineTo(newPix.x, newPix.y);
  p.pix = newPix;
}

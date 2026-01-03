import { LngLat, Pixel } from "../models";
import { Scene } from "./scene";
import InterpolatedWind from "../interpolated-wind";
import * as utils from "../utils";

const MAX_AGE = 1200; // 10..100
const PARTICLES_COUNT = 3000; // 0..5000
const ALPHA_DECAY = 0.95; // 0.8..1
const TRAVEL_SPEED = 45; // 1500; // 0..4000
const FPS = 30;

type Particle = {
  pix0: Pixel;
  coord0: LngLat;
  pix: Pixel;
  coord: LngLat;
  age: number;
  visible: boolean;
};

export default class Particles {
  canvas: HTMLCanvasElement;
  particles: Particle[] = [];

  rafId?: number;
  paused = false;
  running = false;
  wind?: InterpolatedWind;
  interpolationFactor: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  show(scene: Scene, wind: InterpolatedWind, interpolationFactor: number) {
    // Update wind reference (used by the animation loop)
    this.wind = wind;
    this.interpolationFactor = interpolationFactor;

    // Don't restart if already running
    if (this.running) return;

    this.running = true;
    this.paused = false;
    this.particles = generateParticles(scene);

    const context = this.canvas.getContext("2d")!;
    let previous: number;

    const tick = (timestamp: number) => {
      if (this.paused || !this.wind) return;

      if (previous) {
        const delta = timestamp - previous;

        if (delta >= 1000 / FPS) {
          context.beginPath();
          context.strokeStyle = "rgba(210,210,210,0.7)";

          this.particles.forEach((p) =>
            moveParticle(
              p,
              delta,
              context,
              scene,
              this.wind!,
              this.interpolationFactor,
            ),
          );

          context.stroke();
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
      requestAnimationFrame(tick);
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
}

function generateParticles(scene: Scene) {
  const radius = scene.sphereRadius - 1;
  const { width, height } = scene;
  let particles = [];
  let pix0: Pixel, coord0: LngLat, pos: [number, number] | null;

  for (let i = 0; i < PARTICLES_COUNT; i++) {
    if (radius * 2 > 1.41421 * width) {
      pix0 = {
        x: Math.random() * (width - 1),
        y: Math.random() * (height - 1),
      };
    } else {
      const randomAngle = Math.random() * 2 * Math.PI;
      const randomRadiusSqrt = Math.random() * radius ** 2;

      pix0 = {
        x: Math.sqrt(randomRadiusSqrt) * Math.cos(randomAngle) + width / 2,
        y: Math.sqrt(randomRadiusSqrt) * Math.sin(randomAngle) + height / 2,
      };
    }

    pos = scene.projection.invert
      ? scene.projection.invert([pix0.x, pix0.y])
      : null;

    if (pos) {
      coord0 = { lng: pos[0], lat: pos[1] };

      if (coord0.lng > 180) coord0.lng = -180 + (coord0.lng - 180);

      particles.push({
        pix0,
        coord0,
        pix: pix0,
        coord: coord0,
        age: MAX_AGE * Math.random(),
        visible: true,
      });
    } else {
      console.error("Particle generated out of bounds", pix0);
    }
  }
  return particles;
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
    p.pix = p.pix0;
    p.coord = p.coord0;
    p.age = (MAX_AGE * Math.random()) / 4;
    p.visible = true;
  } else {
    if (p.visible) {
      let windSpeed = wind.speedAtWithFactor(p.coord, interpolationFactor);

      if (windSpeed) {
        let { u, v } = windSpeed;

        const lngDeltaDist = u * delta * TRAVEL_SPEED;
        const latDeltaDist = v * delta * TRAVEL_SPEED;

        const lngDeltaDeg = lngDeltaDist / utils.lngOneDegToM(p.coord.lat);
        const latDeltaDeg = latDeltaDist / utils.latOneDegToM;

        p.coord = {
          lng: utils.reframeLongitude(p.coord.lng + lngDeltaDeg),
          lat: p.coord.lat + latDeltaDeg,
        };

        if (p.coord.lat > 90 || p.coord.lat < -90) {
          p.visible = false;
        }

        const xy = scene.projection([p.coord.lng, p.coord.lat]);

        if (xy) {
          let [x, y] = xy;

          const rx = x - scene.sphereCenter.x;
          const ry = y - scene.sphereCenter.y;

          if (
            rx ** 2 + ry ** 2 >= scene.sphereRadius ** 2 ||
            Math.abs(p.coord.lat) > 90 ||
            Math.abs(p.coord.lng) > 180
          ) {
            p.visible = false;
          }

          if (p.visible) {
            context.moveTo(p.pix.x, p.pix.y);
            context.lineTo(x, y);
            p.pix = { x, y };
          }
        }
      } else {
        p.visible = false;
      }
    }
  }
}

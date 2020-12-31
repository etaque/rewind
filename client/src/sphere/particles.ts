import { LngLat, Pixel, Scene } from "../models";
import * as wind from "../wind";
import * as utils from "../utils";

const MAX_AGE = 1200; // 10..100
const PARTICLES_COUNT = 4500; // 0..5000
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

export default function render(
  scene: Scene,
  canvas: HTMLCanvasElement,
  raster: wind.WindRaster
) {
  const context = canvas.getContext("2d")!;
  let particles = generateParticles(scene);

  let previous: number;

  const tick = (timestamp: number) => {
    if (previous) {
      const delta = timestamp - previous;

      if (delta >= 1000 / FPS) {
        context.beginPath();
        context.strokeStyle = "rgba(210,210,210,0.7)";

        particles.forEach((p) =>
          moveParticle(p, delta, context, scene, raster)
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
  requestAnimationFrame(tick);
}

function generateParticles(scene: Scene) {
  // Create n particles on an almost uniform grid
  const radius = scene.radius - 1;
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

    // @ts-ignore
    pos = scene.projection.invert([pix0.x, pix0.y]);

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
  raster: wind.WindRaster
) {
  p.age += delta;
  if (p.age > MAX_AGE) {
    p.pix = p.pix0;
    p.coord = p.coord0;
    p.age = (MAX_AGE * Math.random()) / 4;
    p.visible = true;
  } else {
    if (p.visible) {
      let windSpeed = wind.speedAt(raster, p.coord);

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

          const rx = x - scene.center.x;
          const ry = y - scene.center.y;

          if (
            rx ** 2 + ry ** 2 >= scene.radius ** 2 ||
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

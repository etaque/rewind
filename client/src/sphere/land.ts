import * as topojson from "topojson-client";
import * as d3 from "d3";
import { Topology } from "topojson-specification";
import { Scene } from "./scene";

const LOW_RES_PATH = "/sphere/land-110m.json";

export default class Land {
  canvas: HTMLCanvasElement;
  lowRes?: d3.GeoPermissibleObjects;
  highRes?: d3.GeoPermissibleObjects;

  land?: d3.GeoPermissibleObjects;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async render(scene: Scene, _moving: boolean) {
    this.land ??= await getLand(LOW_RES_PATH);

    const graticule = d3.geoGraticule10();
    const context = this.canvas.getContext("2d")!;
    const path = d3.geoPath(scene.projection, context);

    // Clear full canvas (at DPR resolution) and apply DPR scale
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.scale(scene.dpr, scene.dpr);

    // Draw land with shadow/glow effect
    context.shadowColor = "rgba(0, 0, 0, 0.4)";
    context.shadowBlur = 12;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;

    context.fillStyle = "rgba(255, 255, 255, 0.15)";
    context.strokeStyle = "rgba(34, 45, 34, 0.3)";
    context.beginPath();
    path(this.land);
    context.fill();

    // Reset shadow before stroke to keep coastline crisp
    context.shadowBlur = 0;
    context.stroke();

    context.strokeStyle = "rgba(255, 255, 255, 0.08)";
    context.beginPath();
    path(graticule);
    context.stroke();
  }
}

async function getLand(path: string): Promise<d3.GeoPermissibleObjects> {
  const world = await d3.json<Topology>(path);
  if (world) return topojson.feature(world, world.objects.land);
  else return Promise.reject("Failed to fetch land at: " + path);
}

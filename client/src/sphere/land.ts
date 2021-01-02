import * as topojson from "topojson-client";
import * as d3 from "d3";
import { Topology } from "topojson-specification";
import { Scene } from "./scene";

const LOW_RES_PATH = "/sphere/land-110m.json";
const HIGH_RES_PATH = "/sphere/land-50m.json";

export default class Land {
  canvas: HTMLCanvasElement;
  lowRes?: d3.GeoPermissibleObjects;
  highRes?: d3.GeoPermissibleObjects;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async render(scene: Scene, moving: boolean) {
    const land = moving
      ? (this.lowRes ??= await getLand(LOW_RES_PATH))
      : (this.highRes ??= await getLand(HIGH_RES_PATH));

    const graticule = d3.geoGraticule10();
    const context = this.canvas.getContext("2d")!;
    const path = d3.geoPath(scene.projection, context);
    context.clearRect(0, 0, scene.width, scene.height);

    context.strokeStyle = "rgba(255, 255, 255, 0.8)";
    context.beginPath();
    path(land);
    context.stroke();

    context.strokeStyle = "rgba(221, 221, 221, 0.2)";
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

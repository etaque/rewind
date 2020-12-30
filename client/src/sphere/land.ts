import * as d3 from "d3";
import { Scene } from "../models";

export default function render(
  scene: Scene,
  canvas: HTMLCanvasElement,
  land: d3.GeoPermissibleObjects
) {
  const graticule = d3.geoGraticule10();
  const context = canvas.getContext("2d")!;
  const path = d3.geoPath(scene.projection, context);
  context.clearRect(0, 0, scene.width, scene.height);

  context.strokeStyle = "rgba(255, 255, 255, 0.8)";
  context.beginPath(), path(land), context.stroke();

  context.strokeStyle = "rgba(221, 221, 221, 0.2)";
  context.beginPath(), path(graticule), context.stroke();
}

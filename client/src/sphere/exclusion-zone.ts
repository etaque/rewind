import * as d3 from "d3";
import { ExclusionZone } from "../models";
import { Scene } from "./scene";

export default class ExclusionZoneRenderer {
  private canvas: HTMLCanvasElement;
  private zones: ExclusionZone[];

  constructor(canvas: HTMLCanvasElement, zones: ExclusionZone[]) {
    this.canvas = canvas;
    this.zones = zones;
  }

  setZones(zones: ExclusionZone[]) {
    this.zones = zones;
  }

  render(scene: Scene) {
    if (this.zones.length === 0) return;

    const context = this.canvas.getContext("2d")!;
    const path = d3.geoPath(scene.projection, context);

    for (const zone of this.zones) {
      const geoJson: GeoJSON.Feature<GeoJSON.Polygon> = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [zone.polygon.map((p) => [p.lng, p.lat])],
        },
      };

      // Semi-transparent red fill
      context.fillStyle = "rgba(180, 60, 60, 0.3)";
      context.strokeStyle = "rgba(200, 80, 80, 0.7)";
      context.lineWidth = 1;

      context.beginPath();
      path(geoJson);
      context.fill();
      context.stroke();
    }
  }
}

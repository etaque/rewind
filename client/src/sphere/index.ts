/**
 * Heavily inspired from https://observablehq.com/@oskarkocol/animated-wind-map
 **/

import * as d3 from "d3";
import * as topojson from "topojson-client";
import { Topology } from "topojson-specification";

import { Course, LngLat } from "../models";
import * as wind from "../wind";
import renderParticles from "./particles";
import renderTexture from "./texture";
import renderLand from "./land";

const sphere: d3.GeoSphere = { type: "Sphere" };

export class SphereView {
  readonly course: Course;
  readonly node: HTMLElement;

  width: number;
  height: number;

  uvRaster?: wind.WindRaster;
  speedRaster?: wind.WindRaster;
  position: LngLat;
  projection: d3.GeoProjection;

  landCanvas: HTMLCanvasElement;
  textureCanvas: HTMLCanvasElement;
  particlesCanvas: HTMLCanvasElement;
  land?: d3.GeoPermissibleObjects;

  constructor(node: HTMLElement, course: Course) {
    this.course = course;
    this.node = node;
    this.position = course.start;
    this.width = document.body.clientWidth;
    this.height = document.body.clientHeight;

    this.projection = d3
      .geoOrthographic()
      .precision(0.1)
      .fitSize([this.width, this.height], sphere);

    this.textureCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "wind-texture fixed opacity-80")
      .attr("width", this.width)
      .attr("height", this.height)
      .node()!;

    this.landCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "land fixed")
      .attr("width", this.width)
      .attr("height", this.height)
      .node()!;

    this.particlesCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "wind-particles fixed")
      .attr("width", this.width)
      .attr("height", this.height)
      .node()!;
  }

  updateWindUV(raster: wind.WindRaster) {
    this.uvRaster = raster;
    this.render();
  }

  updateWindSpeed(raster: wind.WindRaster) {
    this.speedRaster = raster;
    this.render();
  }

  updatePosition(pos: LngLat) {
    this.position = pos;
    this.render();
  }

  async render() {
    const pathGen = d3.geoPath(this.projection);
    const [[x0], [x1]] = pathGen.bounds(sphere);
    const [cx, cy] = pathGen.centroid(sphere);

    let scene = {
      projection: this.projection,
      width: this.width,
      height: this.height,
      radius: (x1 - x0) / 2,
      center: { x: cx, y: cy },
    };

    if (this.speedRaster) {
      renderTexture(scene, this.textureCanvas, this.speedRaster);
    }

    if (this.uvRaster) {
      renderParticles(scene, this.particlesCanvas, this.uvRaster);
    }

    this.land ??= await getLand();
    renderLand(scene, this.landCanvas, this.land);
  }
}

async function getLand(): Promise<d3.GeoPermissibleObjects> {
  const res = await fetch("/sphere/land-110m.json");
  const topo = (await res.json()) as Topology;
  return topojson.feature(topo, topo.objects.land);
}

/**
 * Heavily inspired from https://observablehq.com/@oskarkocol/animated-wind-map
 **/

import * as versor from "./versor";
import * as d3 from "d3";
import { Course, LngLat, Scene, Spherical } from "../models";
import * as utils from "../utils";
import Wind from "../wind";
import Land from "./land";
import WindTexture from "./texture";
import WindParticles from "./particles";

const sphere: d3.GeoSphere = { type: "Sphere" };

export class SphereView {
  readonly course: Course;
  readonly node: HTMLElement;

  width: number;
  height: number;

  currentRotation: Spherical;

  wind?: Wind;
  position: LngLat;

  projection: d3.GeoProjection;
  scene: Scene;

  land: Land;
  particles: WindParticles;
  windTexture: WindTexture;

  v0?: versor.Cartesian;
  q0?: versor.Versor;
  r0?: versor.Euler;

  moving = false;

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

    this.currentRotation = utils.sphericalToRadians(this.projection.rotate());

    const pathGen = d3.geoPath(this.projection);
    const [[x0], [x1]] = pathGen.bounds(sphere);
    const [cx, cy] = pathGen.centroid(sphere);

    this.scene = {
      projection: this.projection,
      width: this.width,
      height: this.height,
      radius: (x1 - x0) / 2,
      center: { x: cx, y: cy },
    };

    const textureCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "wind-texture fixed opacity-80")
      .attr("width", this.width)
      .attr("height", this.height)
      .node()!;

    this.windTexture = new WindTexture(textureCanvas);

    const landCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "land fixed")
      .attr("width", this.width)
      .attr("height", this.height)
      .node()!;

    this.land = new Land(landCanvas);

    const particlesCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "wind-particles fixed")
      .attr("width", this.width)
      .attr("height", this.height)
      .node()!;

    this.particles = new WindParticles(this.scene, particlesCanvas);

    const drag = d3
      .drag()
      .on("start", (e) => {
        this.moving = true;
        this.particles.hide();

        const coords = this.projection.invert
          ? this.projection.invert([e.x, e.y])
          : null;
        if (!coords) return;

        this.v0 = versor.cartesian(coords);
        this.r0 = this.projection.rotate();
        this.q0 = versor.versor(this.r0);
      })
      .on("drag", (e) => {
        this.moving = true;
        this.particles.hide();

        const rotated = this.projection.rotate(this.r0!);
        const coords = rotated.invert ? rotated.invert([e.x, e.y]) : null;
        if (!coords) return;

        const v1 = versor.cartesian(coords);
        let q1 = versor.multiply(this.q0!, versor.delta(this.v0!, v1));

        const [lambda, phi] = versor.rotation(q1);
        const shiftVector: Spherical = [lambda, phi, 0];

        this.projection.rotate(shiftVector);

        this.currentRotation = utils.sphericalToRadians(
          this.projection.rotate()
        );

        this.render();
      })
      .on("end", () => {
        this.currentRotation = utils.sphericalToRadians(
          this.projection.rotate()
        );

        this.moving = false;
        this.render();
      });

    const zoom = d3
      .zoom()
      .scaleExtent([200, 1400])
      .on("start", () => {
        this.moving = true;
        this.particles.hide();
      })
      .on("zoom", (e: d3.D3ZoomEvent<HTMLElement, unknown>) => {
        this.moving = true;
        this.particles.hide();

        this.projection.scale(e.transform.k);

        this.render();
      })
      .on("end", () => {
        this.moving = false;
        this.render();
      });

    d3.select(this.node)
      // @ts-expect-error
      .call(drag)
      // @ts-expect-error
      .call(zoom);
  }

  updateWind(wind: Wind) {
    this.wind = wind;
    this.render();
  }

  updatePosition(pos: LngLat) {
    this.position = pos;
    this.render();
  }

  render() {
    const t = performance.now();
    this.land.render(this.scene, this.moving).then(() => {
      console.log("render:land", performance.now() - t);
    });

    if (this.wind) {
      this.windTexture.render(this.scene, this.wind);

      const t2 = performance.now();
      console.log("render:wind-texture", t2 - t);

      if (!this.moving) {
        this.particles.show(this.scene, this.wind);
        console.log("render:wind-particles", performance.now() - t2);
      }
    }
  }
}

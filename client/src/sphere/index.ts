/**
 * Heavily inspired from https://observablehq.com/@oskarkocol/animated-wind-map
 **/

import * as versor from "./versor";
import * as d3 from "d3";
import { Course, LngLat, Spherical } from "../models";
import { sphere, sphereCenter, sphereRadius } from "./scene";
import Wind from "../wind";
import Land from "./land";
import Boat from "./boat";
import Wake from "./wake";
import WindTexture from "./wind-texture";
import WindParticles from "./wind-particles";

export class SphereView {
  readonly course: Course;
  readonly node: HTMLElement;

  width: number;
  height: number;

  wind?: Wind;
  position: LngLat;
  heading: number;

  projection: d3.GeoProjection;

  land: Land;
  boat: Boat;
  wake: Wake;
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
    this.heading = course.startHeading;
    this.width = document.body.clientWidth;
    this.height = document.body.clientHeight;

    this.projection = d3
      .geoOrthographic()
      .precision(0.1)
      .rotate([-course.start.lng, -course.start.lat])
      .fitSize([this.width, this.height], sphere)
      .scale(500);

    const textureCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "wind-texture fixed opacity-80")
      .attr("width", this.width)
      .attr("height", this.height)
      .node()!;

    this.windTexture = new WindTexture(textureCanvas);

    const particlesCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "wind-particles fixed")
      .attr("width", this.width)
      .attr("height", this.height)
      .node()!;

    this.particles = new WindParticles(particlesCanvas);

    const landCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "land fixed")
      .attr("width", this.width)
      .attr("height", this.height)
      .node()!;

    this.land = new Land(landCanvas);
    this.wake = new Wake(landCanvas);
    this.boat = new Boat(landCanvas);

    const initialScale = this.projection.scale();

    const zoom = d3
      .zoom()
      .scaleExtent([0.8, 8])
      .on("start", (e: d3.D3ZoomEvent<HTMLElement, unknown>) => {
        this.moving = true;
        this.particles.hide();

        const coords = this.projection.invert
          ? this.projection.invert(d3.pointer(e))
          : null;
        if (!coords) return;

        this.v0 = versor.cartesian(coords);
        this.r0 = this.projection.rotate();
        this.q0 = versor.versor(this.r0);

        this.render();
      })
      .on("zoom", (e: d3.D3ZoomEvent<HTMLElement, unknown>) => {
        this.moving = true;
        this.particles.hide();

        this.projection.scale(initialScale * e.transform.k);

        const rotated = this.projection.rotate(this.r0!);
        const coords = rotated.invert ? rotated.invert(d3.pointer(e)) : null;
        if (!coords) return;

        const v1 = versor.cartesian(coords);
        let q1 = versor.multiply(this.q0!, versor.delta(this.v0!, v1));

        const [lambda, phi] = versor.rotation(q1);
        // North always up: ignore gamma
        const shiftVector: Spherical = [lambda, phi, 0];

        this.projection.rotate(shiftVector);

        this.render();
      })
      .on("end", () => {
        this.moving = false;
        this.render();
      });

    // @ts-ignore
    d3.select(this.node).call(zoom);
  }

  updateWind(wind: Wind) {
    this.wind = wind;
    this.render();
  }

  updatePosition(pos: LngLat, heading: number, boatSpeed: number = 0) {
    this.position = pos;
    this.heading = heading;
    this.wake.addPoint(pos, boatSpeed);
    this.render();
  }

  render() {
    const scene = {
      projection: this.projection,
      width: this.width,
      height: this.height,
      sphereRadius: sphereRadius(this.projection),
      sphereCenter: sphereCenter(this.projection),
    };

    this.land.render(scene, this.moving).then(() => {
      // Draw wake and boat on top of land
      this.wake.render(scene);
      this.boat.render(scene, this.position, this.heading);
    });

    if (this.wind) {
      this.windTexture.render(scene, this.wind);

      if (!this.moving) {
        this.particles.show(scene, this.wind);
      }
    }
  }
}

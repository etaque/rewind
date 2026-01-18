/**
 * Heavily inspired from https://observablehq.com/@oskarkocol/animated-wind-map
 **/

import * as versor from "./versor";
import * as d3 from "d3";
import { Course, LngLat, Spherical, WindSpeed } from "../models";
import { sphere, sphereCenter, sphereRadius } from "./scene";
import InterpolatedWind from "../interpolated-wind";
import Land from "./land";
import Boat from "./boat";
import Wake from "./wake";
import WindTexture from "./wind-texture";
import WindParticles from "./wind-particles";
import GhostBoats from "./ghost-boats";
import CourseLine from "./course-line";
import ProjectedPath from "./projected-path";
import { ProjectedPoint } from "../app/projected-path";

export class SphereView {
  readonly course: Course;
  readonly node: HTMLElement;

  width: number;
  height: number;

  interpolatedWind?: InterpolatedWind;
  interpolationFactor: number = 0;
  position: LngLat;
  heading: number;

  projection: d3.GeoProjection;

  land: Land;
  boat: Boat;
  wake: Wake;
  particles: WindParticles;
  windTexture: WindTexture;
  ghostBoats: GhostBoats;
  courseLine: CourseLine;
  projectedPath: ProjectedPath;

  v0?: versor.Cartesian;
  q0?: versor.Versor;
  r0?: versor.Euler;

  moving = false;

  private zoom: d3.ZoomBehavior<HTMLElement, unknown>;

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
    this.windTexture.onTextureReady = () => this.render();

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
    this.ghostBoats = new GhostBoats(landCanvas);
    this.courseLine = new CourseLine(landCanvas, course);
    this.projectedPath = new ProjectedPath(landCanvas);

    const initialScale = this.projection.scale();

    this.zoom = d3
      .zoom<HTMLElement, unknown>()
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

    d3.select<HTMLElement, unknown>(this.node).call(this.zoom);

    // Click handler to print lng/lat coordinates
    d3.select(this.node).on("click", (e: MouseEvent) => {
      const coords = this.projection.invert?.([e.clientX, e.clientY]);
      if (coords) {
        const [lng, lat] = coords;
        console.log(`lng: ${lng.toFixed(4)}, lat: ${lat.toFixed(4)}`);
      }
    });
  }

  updateWind(interpolatedWind: InterpolatedWind, interpolationFactor: number) {
    this.interpolatedWind = interpolatedWind;
    this.interpolationFactor = interpolationFactor;
    this.render();
  }

  /**
   * Get wind speed at screen coordinates.
   * Returns null if position is outside the globe or no wind data is loaded.
   */
  getWindAtScreen(x: number, y: number, courseTime: number): WindSpeed | null {
    if (!this.interpolatedWind || !this.projection.invert) return null;

    const coords = this.projection.invert([x, y]);
    if (!coords) return null;

    const [lng, lat] = coords;
    return this.interpolatedWind.speedAt({ lng, lat }, courseTime);
  }

  updatePosition(pos: LngLat, heading: number, boatSpeed: number = 0) {
    this.position = pos;
    this.heading = heading;
    this.wake.addPoint(pos, boatSpeed);
    this.render();
  }

  setCourse(course: Course) {
    this.courseLine.setCourse(course);
    this.position = course.start;
    this.heading = course.startHeading;
    this.wake.clear();
    this.render();
  }

  updateProjectedPath(points: ProjectedPoint[]) {
    this.projectedPath.setPoints(points);
    this.render();
  }

  updatePeerPosition(
    peerId: string,
    position: LngLat,
    heading: number,
    name: string,
  ) {
    this.ghostBoats.updatePeer(peerId, position, heading, name);
    this.render();
  }

  removePeer(peerId: string) {
    this.ghostBoats.removePeer(peerId);
    this.render();
  }

  zoomToMax() {
    const maxScale = 8;
    const selection = d3.select<HTMLElement, unknown>(this.node);
    this.zoom.scaleTo(selection, maxScale);
  }

  resize() {
    const oldWidth = this.width;
    const oldHeight = this.height;
    const oldScale = this.projection.scale();

    this.width = document.body.clientWidth;
    this.height = document.body.clientHeight;

    // Resize all canvases
    const canvases = this.node.querySelectorAll("canvas");
    canvases.forEach((canvas) => {
      canvas.width = this.width;
      canvas.height = this.height;
    });

    // Calculate what the default scale would be for the new size
    this.projection.fitSize([this.width, this.height], sphere);
    const newDefaultScale = this.projection.scale();

    // Calculate what the default scale was for the old size
    this.projection.fitSize([oldWidth, oldHeight], sphere);
    const oldDefaultScale = this.projection.scale();

    // Preserve zoom ratio and apply to new default scale
    const zoomRatio = oldScale / oldDefaultScale;
    this.projection.fitSize([this.width, this.height], sphere);
    this.projection.scale(newDefaultScale * zoomRatio);

    // Clear particles state since canvas was reset
    this.particles.reset();

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
      // Draw course line, projected path, wake and boats on top of land
      this.courseLine.render(scene);
      this.projectedPath.render(scene);
      this.wake.render(scene);
      this.ghostBoats.render(scene);
      this.boat.render(scene, this.position, this.heading);
    });

    const currentRaster = this.interpolatedWind?.getCurrentRaster();
    if (currentRaster) {
      this.windTexture.render(scene, {
        currentRaster,
        nextRaster: this.interpolatedWind?.getNextRaster() ?? undefined,
        interpolationFactor: this.interpolationFactor,
      });

      if (!this.moving) {
        // Pass interpolated wind to particles for smooth wind flow visualization
        this.particles.show(
          scene,
          this.interpolatedWind!,
          this.interpolationFactor,
        );
      }
    }
  }
}

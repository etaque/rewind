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
import CourseLine, { MarkerHit } from "./course-line";
import ProjectedPath from "./projected-path";
import ExclusionZoneRenderer from "./exclusion-zone";
import { ProjectedPoint } from "../app/projected-path";
import Stars from "./stars";

const MAX_SCALE = 12;

/** Get device pixel ratio, capped at 2 for performance */
function getDPR(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}

export class SphereView {
  private course: Course | null;
  readonly node: HTMLElement;

  width: number;
  height: number;

  interpolatedWind?: InterpolatedWind;
  interpolationFactor: number = 0;
  position: LngLat;
  heading: number;

  projection: d3.GeoProjection;

  stars: Stars;
  land: Land;
  boat: Boat;
  wake: Wake;
  particles: WindParticles;
  windTexture: WindTexture;
  ghostBoats: GhostBoats;
  courseLine: CourseLine | null = null;
  projectedPath: ProjectedPath;
  exclusionZones: ExclusionZoneRenderer | null = null;

  v0?: versor.Cartesian;
  q0?: versor.Versor;
  r0?: versor.Euler;

  onClickCoord: ((coord: LngLat) => void) | null = null;
  onDragMarker: ((marker: MarkerHit, coord: LngLat) => void) | null = null;
  onDragMarkerEnd: (() => void) | null = null;
  private draggingMarker: MarkerHit | null = null;

  moving = false;
  private renderGeneration = 0;

  private zoom: d3.ZoomBehavior<HTMLElement, unknown>;
  private initialScale: number = 500;

  constructor(node: HTMLElement, course: Course | null = null) {
    this.course = course;
    this.node = node;
    // Default to Atlantic view if no course
    this.position = course?.start ?? { lng: -30, lat: 20 };
    this.heading = course?.startHeading ?? 0;
    this.width = document.body.clientWidth;
    this.height = document.body.clientHeight;

    // Default scale for full globe view
    const initialRotation: [number, number] = course
      ? [-course.start.lng, -course.start.lat]
      : [-30, -20]; // Atlantic-centered view

    this.projection = d3
      .geoOrthographic()
      .precision(0.1)
      .rotate(initialRotation)
      .fitSize([this.width, this.height], sphere)
      .scale(course ? 500 : 500); // Same scale, bigger globe when no course

    const dpr = getDPR();

    const starsCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "stars fixed")
      .style("width", `${this.width}px`)
      .style("height", `${this.height}px`)
      .attr("width", this.width * dpr)
      .attr("height", this.height * dpr)
      .node()!;

    this.stars = new Stars(starsCanvas);

    const textureCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "wind-texture fixed opacity-80")
      .style("width", `${this.width}px`)
      .style("height", `${this.height}px`)
      .attr("width", this.width * dpr)
      .attr("height", this.height * dpr)
      .node()!;

    this.windTexture = new WindTexture(textureCanvas, dpr);
    this.windTexture.onTextureReady = () => this.render();

    const particlesCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "wind-particles fixed")
      .style("width", `${this.width}px`)
      .style("height", `${this.height}px`)
      .attr("width", this.width * dpr)
      .attr("height", this.height * dpr)
      .node()!;

    this.particles = new WindParticles(particlesCanvas, dpr);

    const landCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "land fixed")
      .style("width", `${this.width}px`)
      .style("height", `${this.height}px`)
      .attr("width", this.width * dpr)
      .attr("height", this.height * dpr)
      .node()!;

    this.land = new Land(landCanvas);
    this.wake = new Wake(landCanvas);
    this.boat = new Boat(landCanvas);
    this.ghostBoats = new GhostBoats(landCanvas);
    this.projectedPath = new ProjectedPath(landCanvas);

    // Only create course-related renderers if we have a course
    if (course) {
      this.courseLine = new CourseLine(landCanvas, course);
      this.exclusionZones = new ExclusionZoneRenderer(
        landCanvas,
        course.exclusionZones,
      );
    }

    this.initialScale = this.projection.scale();

    this.zoom = d3
      .zoom<HTMLElement, unknown>()
      .scaleExtent([0.8, MAX_SCALE])
      .filter((e: Event) => {
        // Always allow wheel (zoom)
        if (e.type === "wheel") return true;
        // Block pan if pointer is on a marker
        if (
          this.courseLine &&
          (e.type === "mousedown" || e.type === "pointerdown")
        ) {
          const me = e as MouseEvent;
          const hit = this.courseLine.getMarkerAt(me.clientX, me.clientY);
          if (hit) return false;
        }
        return true;
      })
      .on("start", (e: d3.D3ZoomEvent<HTMLElement, unknown>) => {
        // Cancel any running view animation when user starts interacting
        d3.select(this.node).interrupt("view-animation");

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

        this.projection.scale(this.initialScale * e.transform.k);

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

    // Click handler for coordinate selection
    d3.select(this.node).on("click", (e: MouseEvent) => {
      const coords = this.projection.invert?.([e.clientX, e.clientY]);
      if (coords) {
        const [lng, lat] = coords;
        if (this.onClickCoord) {
          this.onClickCoord({ lng, lat });
        }
      }
    });

    // Pointer event listeners for marker drag
    d3.select(this.node)
      .on("pointerdown.markerdrag", (e: PointerEvent) => {
        if (!this.courseLine || !this.onDragMarker) return;
        const hit = this.courseLine.getMarkerAt(e.clientX, e.clientY);
        if (!hit) return;
        this.draggingMarker = hit;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
      })
      .on("pointermove.markerdrag", (e: PointerEvent) => {
        if (!this.draggingMarker || !this.onDragMarker) return;
        const coords = this.projection.invert?.([e.clientX, e.clientY]);
        if (coords) {
          this.onDragMarker(this.draggingMarker, {
            lng: coords[0],
            lat: coords[1],
          });
        }
      })
      .on("pointerup.markerdrag", () => {
        if (this.draggingMarker) {
          this.draggingMarker = null;
          this.onDragMarkerEnd?.();
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

    // Check if cursor is within the visible sphere
    const center = sphereCenter(this.projection);
    const radius = sphereRadius(this.projection);
    const dx = x - center.x;
    const dy = y - center.y;
    if (dx * dx + dy * dy > radius * radius) return null;

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
    this.course = course;
    this.position = course.start;
    this.heading = course.startHeading;
    this.wake.clear();

    // Create course renderers if they don't exist yet
    if (!this.courseLine) {
      this.courseLine = new CourseLine(this.land.canvas, course);
    } else {
      this.courseLine.setCourse(course);
    }

    if (!this.exclusionZones) {
      this.exclusionZones = new ExclusionZoneRenderer(
        this.land.canvas,
        course.exclusionZones,
      );
    } else {
      this.exclusionZones.setZones(course.exclusionZones);
    }

    this.render();
  }

  setNextGateIndex(index: number) {
    this.courseLine?.setNextGateIndex(index);
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

  updateRecordedGhosts(
    ghosts: Map<
      number,
      { name: string; lng: number; lat: number; heading: number }
    >,
  ) {
    this.ghostBoats.updateRecordedGhosts(ghosts);
    this.render();
  }

  zoomToMax() {
    const baseScale = 500;
    const targetScale = baseScale * MAX_SCALE;
    this.animateToView(this.position.lng, this.position.lat, targetScale, 1000);
  }

  /**
   * Focus the viewport on the course start and first gate (or finish if no gates).
   * Adjusts rotation and zoom to show both points comfortably.
   */
  focusOnCourseStart() {
    if (!this.course) return;

    const start = this.course.start;
    // Get target point: first gate center, or finish line center if no gates
    const target =
      this.course.gates.length > 0
        ? this.course.gates[0].center
        : this.course.finishLine.center;

    // Calculate center point between start and target
    const centerLng = (start.lng + target.lng) / 2;
    const centerLat = (start.lat + target.lat) / 2;

    // Calculate distance in degrees (rough approximation)
    const dLng = Math.abs(start.lng - target.lng);
    const dLat = Math.abs(start.lat - target.lat);
    const distance = Math.sqrt(dLng * dLng + dLat * dLat);

    // Determine zoom level based on distance
    // Larger distance = smaller scale (zoomed out)
    // We need both points to fit in the viewport
    const minScale = 1.0;
    const maxScale = 6;
    const scale = Math.max(minScale, Math.min(maxScale, 120 / (distance + 20)));

    // Convert scale factor to actual projection scale
    const baseScale = 500;
    const targetScale = baseScale * scale;

    this.animateToView(centerLng, centerLat, targetScale, 1500);
  }

  /**
   * Animate the view to a target rotation and scale.
   * @param targetLng Target longitude to center on
   * @param targetLat Target latitude to center on
   * @param targetScale Target projection scale
   * @param duration Animation duration in ms
   */
  private animateToView(
    targetLng: number,
    targetLat: number,
    targetScale: number,
    duration: number,
  ) {
    const startRotation = this.projection.rotate() as [number, number, number];
    const startScale = this.projection.scale();

    // Cancel any existing animation
    d3.select(this.node).interrupt("view-animation");

    // Hide particles during animation (same as user drag behavior)
    this.moving = true;
    this.particles.hide();

    d3.select(this.node)
      .transition("view-animation")
      .duration(duration)
      .ease(d3.easeCubicInOut)
      .tween("view", () => {
        const rotateInterp = d3.interpolate(startRotation, [
          -targetLng,
          -targetLat,
          0,
        ]);
        const scaleInterp = d3.interpolate(startScale, targetScale);
        return (t: number) => {
          this.projection.rotate(rotateInterp(t) as [number, number, number]);
          this.projection.scale(scaleInterp(t));
          this.render();
        };
      })
      .on("end", () => {
        // Sync D3 zoom transform with the new scale
        // This prevents jump when user starts scrolling after animation
        const newK = this.projection.scale() / this.initialScale;
        const selection = d3.select<HTMLElement, unknown>(this.node);
        this.zoom.transform(selection, d3.zoomIdentity.scale(newK));

        // Re-enable particles after animation completes
        this.moving = false;
        this.render();
      });
  }

  resize() {
    const oldWidth = this.width;
    const oldHeight = this.height;
    const oldScale = this.projection.scale();

    this.width = document.body.clientWidth;
    this.height = document.body.clientHeight;

    const dpr = getDPR();

    // Resize all canvases with DPR scaling
    const canvases = this.node.querySelectorAll("canvas");
    canvases.forEach((canvas) => {
      canvas.style.width = `${this.width}px`;
      canvas.style.height = `${this.height}px`;
      canvas.width = this.width * dpr;
      canvas.height = this.height * dpr;
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
    const dpr = getDPR();
    const scene = {
      projection: this.projection,
      width: this.width,
      height: this.height,
      sphereRadius: sphereRadius(this.projection),
      sphereCenter: sphereCenter(this.projection),
      dpr,
    };

    this.stars.render(scene);

    const currentGeneration = ++this.renderGeneration;
    this.land.render(scene, this.moving).then(() => {
      // Skip if a newer render has started
      if (currentGeneration !== this.renderGeneration) return;
      // Draw exclusion zones, course line, projected path, wake and boats on top of land
      this.exclusionZones?.render(scene);
      this.courseLine?.render(scene);
      this.projectedPath.render(scene);
      this.wake.render(scene);
      this.ghostBoats.render(scene);
      // Only render boat if we have a course (i.e., we're in a race context)
      if (this.course) {
        this.boat.render(scene, this.position, this.heading);
      }
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

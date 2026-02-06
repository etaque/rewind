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
import OffscreenIndicators from "./offscreen-indicators";
import { polarToBoatType } from "./boat-geometry";
import CourseLine from "./course-line";

import Stars from "./stars";

const MAX_SCALE = 50;

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
  offscreenIndicators: OffscreenIndicators;
  private boatCanvas: HTMLCanvasElement;
  courseLine: CourseLine | null = null;
  v0?: versor.Cartesian;
  q0?: versor.Versor;
  r0?: versor.Euler;

  moving = false;
  private vmgBad = false;
  private twaLocked = false;
  private windDirection: number | null = null;
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

    const textureCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "wind-texture fixed opacity-80")
      .style("mix-blend-mode", "screen")
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

    const boatCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "boat fixed")
      .style("width", `${this.width}px`)
      .style("height", `${this.height}px`)
      .attr("width", this.width * dpr)
      .attr("height", this.height * dpr)
      .node()!;

    this.boatCanvas = boatCanvas;
    this.wake = new Wake(boatCanvas);
    this.boat = new Boat(boatCanvas);
    this.ghostBoats = new GhostBoats(boatCanvas);
    this.offscreenIndicators = new OffscreenIndicators(boatCanvas);
    // Only create course-related renderers if we have a course
    if (course) {
      this.courseLine = new CourseLine(boatCanvas, course);
    }

    this.initialScale = this.projection.scale();

    this.zoom = d3
      .zoom<HTMLElement, unknown>()
      .scaleExtent([0.8, MAX_SCALE])
      .wheelDelta((e) => -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.005))
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

  updateVMGStatus(bad: boolean) {
    this.vmgBad = bad;
  }

  updateTWALockStatus(locked: boolean) {
    this.twaLocked = locked;
  }

  updateWindDirection(direction: number | null) {
    this.windDirection = direction;
  }

  updatePosition(pos: LngLat, heading: number, boatSpeed: number = 0) {
    // Check boundary crossing: was the boat in the safe zone before this move?
    const oldScreen = this.projection([this.position.lng, this.position.lat]);
    const wasInSafeZone = oldScreen !== null && this.isInSafeZone(oldScreen[0], oldScreen[1]);

    this.position = pos;
    this.heading = heading;
    this.wake.addPoint(pos, boatSpeed);

    if (!this.moving && wasInSafeZone) {
      const newScreen = this.projection([pos.lng, pos.lat]);
      if (!newScreen || !this.isInSafeZone(newScreen[0], newScreen[1])) {
        this.centerOnBoat();
        return;
      }
    }

    this.render();
  }

  setCourse(course: Course) {
    this.course = course;
    this.position = course.start;
    this.heading = course.startHeading;
    this.wake.clear();

    // Create course renderers if they don't exist yet
    if (!this.courseLine) {
      this.courseLine = new CourseLine(this.boatCanvas, course);
    } else {
      this.courseLine.setCourse(course);
    }

    this.render();
  }

  setNextGateIndex(index: number) {
    this.courseLine?.setNextGateIndex(index);
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
    // Use half of MAX_SCALE for gameplay zoom, leaving room for user to zoom in more
    const targetScale = baseScale * MAX_SCALE * 0.5;
    this.animateToView(this.position.lng, this.position.lat, targetScale, 1000);
  }

  zoomIn() {
    const currentScale = this.projection.scale();
    const maxScale = this.initialScale * MAX_SCALE;
    const targetScale = Math.min(currentScale * 1.5, maxScale);
    // Center ahead of boat, then zoom keeping boat at that position
    this.centerOnBoatWithScale(targetScale, 200);
  }

  zoomOut() {
    const currentScale = this.projection.scale();
    const minScale = this.initialScale * 0.8;
    const targetScale = Math.max(currentScale / 1.5, minScale);
    this.zoomCenteredOnBoat(targetScale, 200);
  }

  /**
   * Zoom while keeping the boat at its current screen position.
   * The map zooms around the boat rather than the screen center.
   */
  private zoomCenteredOnBoat(targetScale: number, duration: number) {
    const currentScale = this.projection.scale();

    // Get boat's current screen position
    const boatScreen = this.projection([this.position.lng, this.position.lat]);
    if (!boatScreen) {
      // Boat not visible, just center on it
      this.animateToView(this.position.lng, this.position.lat, targetScale, duration);
      return;
    }

    const [bx, by] = boatScreen;
    const factor = targetScale / currentScale;

    // Calculate what old screen position will become the new center after zoom
    // This ensures the boat stays at (bx, by) on screen
    const newCenterOldScreenX = bx + (this.width / 2 - bx) / factor;
    const newCenterOldScreenY = by + (this.height / 2 - by) / factor;

    // Convert to geo coords
    const newCenter = this.projection.invert?.([newCenterOldScreenX, newCenterOldScreenY]);

    if (newCenter) {
      this.animateToView(newCenter[0], newCenter[1], targetScale, duration);
    } else {
      // Fallback: center on boat
      this.animateToView(this.position.lng, this.position.lat, targetScale, duration);
    }
  }

  /**
   * Center the map ahead of the boat based on heading, with optional scale change.
   * Places the boat at approximately 1/8 from the viewport edge,
   * with the view focused on "where the boat is going".
   * Properly accounts for scale change to keep boat at correct position.
   */
  private centerOnBoatWithScale(targetScale: number, duration: number) {
    const currentScale = this.projection.scale();

    // Project boat position to screen coordinates
    const boatScreen = this.projection([this.position.lng, this.position.lat]);
    if (!boatScreen) {
      // Boat not on visible hemisphere - just center on it directly
      this.animateToView(this.position.lng, this.position.lat, targetScale, duration);
      return;
    }

    const [boatX, boatY] = boatScreen;

    // Calculate target screen position for boat (1/8 from edge, opposite to heading)
    const edgeFraction = 0.125; // 1/8 from edge
    const offsetFraction = 0.5 - edgeFraction; // 0.375

    // Heading: 0 = North (up/-Y), 90 = East (right/+X)
    // Boat should be offset from center in opposite direction of heading
    const headingRad = (this.heading * Math.PI) / 180;
    const targetBoatX = this.width / 2 - Math.sin(headingRad) * this.width * offsetFraction;
    const targetBoatY = this.height / 2 + Math.cos(headingRad) * this.height * offsetFraction;

    // Calculate new center that puts boat at target position with target scale
    // This combines panning (to target position) and zooming (keeping boat fixed)
    const factor = targetScale / currentScale;
    const newCenterOldScreenX = boatX + (this.width / 2 - targetBoatX) / factor;
    const newCenterOldScreenY = boatY + (this.height / 2 - targetBoatY) / factor;

    // Convert to geo coords using current projection
    const newCenter = this.projection.invert?.([newCenterOldScreenX, newCenterOldScreenY]);

    if (newCenter) {
      this.animateToView(newCenter[0], newCenter[1], targetScale, duration);
    } else {
      // Fallback: center on boat
      this.animateToView(this.position.lng, this.position.lat, targetScale, duration);
    }
  }

  centerOnBoat() {
    const currentScale = this.projection.scale();
    this.centerOnBoatWithScale(currentScale, 300);
  }

  private isInSafeZone(screenX: number, screenY: number): boolean {
    const edgeFraction = 0.1;
    return (
      screenX >= this.width * edgeFraction &&
      screenX <= this.width * (1 - edgeFraction) &&
      screenY >= this.height * edgeFraction &&
      screenY <= this.height * (1 - edgeFraction)
    );
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
      // Clear boat canvas and draw course line, wake and boats
      const boatCtx = this.boatCanvas.getContext("2d")!;
      boatCtx.setTransform(1, 0, 0, 1, 0, 0);
      boatCtx.clearRect(0, 0, this.boatCanvas.width, this.boatCanvas.height);
      boatCtx.scale(scene.dpr, scene.dpr);
      this.courseLine?.render(scene);
      this.wake.render(scene);
      const boatType = this.course ? polarToBoatType(this.course.polar) : "imoca";
      this.ghostBoats.render(scene, boatType);
      // Only render boat if we have a course (i.e., we're in a race context)
      if (this.course) {
        this.boat.render(scene, this.position, this.heading, boatType, this.vmgBad, this.twaLocked, this.windDirection);
      }
      this.offscreenIndicators.render(scene, this.ghostBoats.peers, this.ghostBoats.recordedGhosts);
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

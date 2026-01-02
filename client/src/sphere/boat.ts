import { geoDistance, geoPath } from "d3-geo";
import type { Polygon } from "geojson";
import { LngLat } from "../models";
import { Scene } from "./scene";

// Boat size in screen pixels (approximate)
const BOAT_SIZE_PX = 64;
// Reference scale at which BOAT_SIZE_PX is the target size
const REFERENCE_SCALE = 4000;

export default class Boat {
  canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  render(scene: Scene, position: LngLat, heading: number) {
    // Check if point is on the visible hemisphere
    const rotate = scene.projection.rotate();
    const center: [number, number] = [-rotate[0], -rotate[1]];
    const point: [number, number] = [position.lng, position.lat];
    if (geoDistance(center, point) > Math.PI / 2) return;

    const context = this.canvas.getContext("2d")!;
    const path = geoPath(scene.projection, context);

    // Calculate boat size in km that gives consistent screen size
    // At scale 500, 1 degree ≈ 500 / 360 * 2π ≈ 8.7 pixels
    // We want BOAT_SIZE_PX pixels, so we need BOAT_SIZE_PX / 8.7 degrees
    // which is BOAT_SIZE_PX / (scale / 360 * 2π) * 111 km
    const scale = scene.projection.scale();
    const sizeKm = (BOAT_SIZE_PX * REFERENCE_SCALE * 111) / (scale * 360);

    // Create boat triangle as a geo polygon
    const boatPolygon = createBoatPolygon(position, heading, sizeKm);

    context.beginPath();
    path(boatPolygon);

    context.fillStyle = "#f472b6";
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.5;
    context.stroke();
  }
}

/**
 * Create a triangle polygon in geo coordinates.
 * The triangle points in the heading direction.
 */
function createBoatPolygon(
  position: LngLat,
  heading: number,
  sizeKm: number,
): Polygon {
  // Triangle vertices relative to center (in local coords, before rotation):
  // Counter-clockwise winding for GeoJSON exterior ring
  const vertices = [
    { dx: 0, dy: sizeKm }, // Tip (forward)
    { dx: sizeKm * 0.6, dy: -sizeKm * 0.6 }, // Bottom right
    { dx: -sizeKm * 0.6, dy: -sizeKm * 0.6 }, // Bottom left
  ];

  // Convert heading to radians (0 = north, clockwise)
  const headingRad = (heading * Math.PI) / 180;

  // Convert each vertex to lat/lng
  const coords = vertices.map(({ dx, dy }) => {
    // Rotate by heading
    const rotatedX = dx * Math.cos(headingRad) + dy * Math.sin(headingRad);
    const rotatedY = -dx * Math.sin(headingRad) + dy * Math.cos(headingRad);

    // Convert km offset to degrees
    // 1 degree latitude ≈ 111 km
    // 1 degree longitude ≈ 111 km * cos(latitude)
    const latOffset = rotatedY / 111;
    const lngOffset =
      rotatedX / (111 * Math.cos((position.lat * Math.PI) / 180));

    return [position.lng + lngOffset, position.lat + latOffset] as [
      number,
      number,
    ];
  });

  // Close the polygon
  coords.push(coords[0]);

  return {
    type: "Polygon",
    coordinates: [coords],
  };
}

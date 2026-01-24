import type { Polygon } from "geojson";
import { LngLat } from "../models";

// Boat size in screen pixels (approximate)
export const BOAT_SIZE_PX = 48;
// Reference scale at which BOAT_SIZE_PX is the target size
export const REFERENCE_SCALE = 4000;

/**
 * Calculate boat size in km based on current projection scale.
 * This ensures consistent screen size regardless of zoom level.
 */
export function getBoatSizeKm(scale: number): number {
  return (BOAT_SIZE_PX * REFERENCE_SCALE * 111) / (scale * 360);
}

/**
 * Create a triangle polygon in geo coordinates.
 * The triangle points in the heading direction.
 */
export function createBoatPolygon(
  position: LngLat,
  heading: number,
  sizeKm: number,
): Polygon {
  // Asteroids-style arrow vertices relative to center (in local coords, before rotation):
  // Counter-clockwise winding for GeoJSON exterior ring
  const vertices = [
    { dx: 0, dy: sizeKm }, // Nose (forward)
    { dx: sizeKm * 0.75, dy: -sizeKm }, // Back right
    { dx: 0, dy: -sizeKm * 0.75 }, // Back center indent
    { dx: -sizeKm * 0.75, dy: -sizeKm }, // Back left
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

import { geoDistance, geoPath } from "d3-geo";
import type { Polygon } from "geojson";
import { LngLat } from "../models";
import { Scene } from "./scene";
import { PeerState } from "../multiplayer/types";

// Boat size in screen pixels (approximate)
const BOAT_SIZE_PX = 64;
// Reference scale at which BOAT_SIZE_PX is the target size
const REFERENCE_SCALE = 4000;

/**
 * Renders other players' boats on the globe.
 * Similar to Boat but with different styling and support for multiple boats.
 */
export default class GhostBoats {
  canvas: HTMLCanvasElement;
  peers: Map<string, PeerState> = new Map();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  updatePeer(peerId: string, position: LngLat, heading: number) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.position = position;
      peer.heading = heading;
      peer.lastUpdate = Date.now();
    } else {
      this.peers.set(peerId, {
        id: peerId,
        name: "Player",
        position,
        heading,
        lastUpdate: Date.now(),
      });
    }
  }

  removePeer(peerId: string) {
    this.peers.delete(peerId);
  }

  setPeers(peers: Map<string, PeerState>) {
    this.peers = peers;
  }

  render(scene: Scene) {
    const context = this.canvas.getContext("2d")!;
    const path = geoPath(scene.projection, context);
    const rotate = scene.projection.rotate();
    const center: [number, number] = [-rotate[0], -rotate[1]];
    const scale = scene.projection.scale();
    const sizeKm = (BOAT_SIZE_PX * REFERENCE_SCALE * 111) / (scale * 360);

    this.peers.forEach((peer) => {
      if (!peer.position || peer.heading == null) return;

      // Check if point is on the visible hemisphere
      const point: [number, number] = [peer.position.lng, peer.position.lat];
      if (geoDistance(center, point) > Math.PI / 2) return;

      // Create boat triangle
      const boatPolygon = createBoatPolygon(
        peer.position,
        peer.heading,
        sizeKm,
      );

      context.beginPath();
      path(boatPolygon);

      // Ghost boats have different styling (cyan/teal color, slightly transparent)
      context.fillStyle = "rgba(34, 211, 238, 0.8)"; // cyan-400
      context.fill();
      context.strokeStyle = "#ffffff";
      context.lineWidth = 1.5;
      context.stroke();

      // Draw player name above boat
      const projected = scene.projection([
        peer.position.lng,
        peer.position.lat,
      ]);
      if (projected) {
        context.font = "12px sans-serif";
        context.textAlign = "center";
        context.fillStyle = "#ffffff";
        context.strokeStyle = "#000000";
        context.lineWidth = 2;
        const textY = projected[1] - 20;
        context.strokeText(peer.name, projected[0], textY);
        context.fillText(peer.name, projected[0], textY);
      }
    });
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

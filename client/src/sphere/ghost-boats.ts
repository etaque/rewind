import { geoDistance, geoPath } from "d3-geo";
import { LngLat } from "../models";
import { Scene } from "./scene";
import { PeerState } from "../multiplayer/types";
import { createBoatPolygon, getBoatSizeKm } from "./boat-geometry";

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

  updatePeer(peerId: string, position: LngLat, heading: number, name: string) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.position = position;
      peer.heading = heading;
      peer.lastUpdate = Date.now();
    } else {
      this.peers.set(peerId, {
        id: peerId,
        name,
        position,
        heading,
        lastUpdate: Date.now(),
      });
    }
  }

  removePeer(peerId: string) {
    this.peers.delete(peerId);
  }

  render(scene: Scene) {
    const context = this.canvas.getContext("2d")!;
    const path = geoPath(scene.projection, context);
    const rotate = scene.projection.rotate();
    const center: [number, number] = [-rotate[0], -rotate[1]];
    const scale = scene.projection.scale();
    const sizeKm = getBoatSizeKm(scale);

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

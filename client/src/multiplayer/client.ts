import { LngLat } from "../models";
import { SignalingClient } from "./signaling";
import { PeerState, MultiplayerCallbacks } from "./types";

/**
 * Manages multiplayer communication via WebSocket.
 * Handles lobby management and server-relayed position updates.
 */
export class MultiplayerClient {
  private signaling: SignalingClient;
  private peerStates: Map<string, PeerState> = new Map();

  constructor(callbacks: MultiplayerCallbacks) {
    this.signaling = new SignalingClient({
      ...callbacks,
      onRaceJoined: (
        raceId,
        playerId,
        players,
        isCreator,
        courseKey,
        windSources,
      ) => {
        // Initialize peer states for existing players
        players.forEach((p) => {
          if (p.id !== playerId) {
            this.peerStates.set(p.id, {
              id: p.id,
              name: p.name,
              position: null,
              heading: null,
              lastUpdate: 0,
            });
          }
        });
        callbacks.onRaceJoined(
          raceId,
          playerId,
          players,
          isCreator,
          courseKey,
          windSources,
        );
      },
      onPlayerJoined: (playerId, playerName) => {
        this.peerStates.set(playerId, {
          id: playerId,
          name: playerName,
          position: null,
          heading: null,
          lastUpdate: 0,
        });
        callbacks.onPlayerJoined(playerId, playerName);
      },
      onPlayerLeft: (playerId) => {
        this.peerStates.delete(playerId);
        callbacks.onPlayerLeft(playerId);
      },
      onPeerPositionUpdate: (peerId, position, heading, _name, raceTime) => {
        // Update peer state
        const peerState = this.peerStates.get(peerId);
        if (peerState) {
          peerState.position = position;
          peerState.heading = heading;
          peerState.lastUpdate = Date.now();
          // Use name from peerState since server doesn't send it
          callbacks.onPeerPositionUpdate(
            peerId,
            position,
            heading,
            peerState.name,
            raceTime,
          );
        }
      },
    });
  }

  async connect(): Promise<void> {
    await this.signaling.connect();
  }

  createRace(courseKey: string, playerName: string) {
    this.signaling.createRace(courseKey, playerName);
  }

  joinRace(raceId: string, playerName: string) {
    this.signaling.joinRace(raceId, playerName);
  }

  leaveRace() {
    this.signaling.leaveRace();
    this.peerStates.clear();
  }

  startRace() {
    this.signaling.startRace();
  }

  disconnect() {
    this.peerStates.clear();
    this.signaling.disconnect();
  }

  getPeers(): Map<string, PeerState> {
    return this.peerStates;
  }

  /**
   * Broadcast position to all peers via server relay.
   */
  broadcastPosition(position: LngLat, heading: number) {
    this.signaling.sendPositionUpdate(position.lng, position.lat, heading);
  }
}

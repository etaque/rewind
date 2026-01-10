import { LngLat } from "../models";
import { SignalingClient } from "./signaling";
import { ServerMessage, PeerState, MultiplayerCallbacks } from "./types";

type PeerConnection = {
  id: string;
  name: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
};

/**
 * Manages WebRTC peer connections for multiplayer racing.
 * Handles P2P mesh topology where each player connects to every other player.
 */
export class WebRTCManager {
  private signaling: SignalingClient;
  private peers: Map<string, PeerConnection> = new Map();
  private peerStates: Map<string, PeerState> = new Map();
  private callbacks: MultiplayerCallbacks;

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
    this.signaling = new SignalingClient(
      {
        ...callbacks,
        onLobbyCreated: (lobbyId, playerId) => {
          callbacks.onLobbyCreated(lobbyId, playerId);
        },
        onLobbyJoined: (lobbyId, playerId, players, isCreator) => {
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
          callbacks.onLobbyJoined(lobbyId, playerId, players, isCreator);
          // Initiate WebRTC connections to existing players
          players.forEach((p) => {
            if (p.id !== playerId) {
              this.initiateConnection(p.id, p.name);
            }
          });
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
          // New player joined - they will initiate connection to us
        },
        onPlayerLeft: (playerId) => {
          this.closePeerConnection(playerId);
          this.peerStates.delete(playerId);
          callbacks.onPlayerLeft(playerId);
        },
      },
      (message) => this.handleWebRTCSignaling(message),
    );
  }

  async connect(): Promise<void> {
    await this.signaling.connect();
  }

  createLobby(courseKey: string, playerName: string) {
    this.signaling.createLobby(courseKey, playerName);
  }

  joinLobby(lobbyId: string, playerName: string) {
    this.signaling.joinLobby(lobbyId, playerName);
  }

  leaveLobby() {
    this.signaling.leaveLobby();
    this.closeAllConnections();
  }

  startRace() {
    this.signaling.startRace();
  }

  disconnect() {
    this.closeAllConnections();
    this.signaling.disconnect();
  }

  getPeers(): Map<string, PeerState> {
    return this.peerStates;
  }

  /**
   * Broadcast position to all connected peers.
   * Uses binary format for efficiency (12 bytes per update).
   */
  broadcastPosition(position: LngLat, heading: number) {
    const buffer = new ArrayBuffer(12);
    const view = new DataView(buffer);
    view.setFloat32(0, position.lng, true);
    view.setFloat32(4, position.lat, true);
    view.setFloat32(8, heading, true);

    this.peers.forEach((peer) => {
      if (peer.dataChannel?.readyState === "open") {
        peer.dataChannel.send(buffer);
      }
    });
  }

  private async initiateConnection(peerId: string, peerName: string) {
    const peer = await this.createPeerConnection(peerId, peerName);

    // Create data channel (we're the initiator)
    const dataChannel = peer.connection.createDataChannel("position", {
      ordered: false,
      maxRetransmits: 0,
    });
    this.setupDataChannel(peerId, dataChannel);
    peer.dataChannel = dataChannel;

    // Create and send offer
    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
    this.signaling.sendOffer(peerId, JSON.stringify(offer));
  }

  private async createPeerConnection(
    peerId: string,
    peerName: string,
  ): Promise<PeerConnection> {
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    const peer: PeerConnection = {
      id: peerId,
      name: peerName,
      connection,
      dataChannel: null,
    };

    this.peers.set(peerId, peer);

    // Handle ICE candidates
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendIceCandidate(
          peerId,
          JSON.stringify(event.candidate),
        );
      }
    };

    // Handle incoming data channel (for non-initiators)
    connection.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
      peer.dataChannel = event.channel;
    };

    connection.onconnectionstatechange = () => {
      if (
        connection.connectionState === "failed" ||
        connection.connectionState === "disconnected"
      ) {
        // Connection lost - peer will be cleaned up when they leave the lobby
      }
    };

    return peer;
  }

  private setupDataChannel(peerId: string, channel: RTCDataChannel) {
    channel.binaryType = "arraybuffer";

    channel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.handlePositionUpdate(peerId, event.data);
      }
    };
  }

  private handlePositionUpdate(peerId: string, data: ArrayBuffer) {
    const view = new DataView(data);
    const lng = view.getFloat32(0, true);
    const lat = view.getFloat32(4, true);
    const heading = view.getFloat32(8, true);

    const position: LngLat = { lng, lat };

    // Update peer state
    const peerState = this.peerStates.get(peerId);
    if (peerState) {
      peerState.position = position;
      peerState.heading = heading;
      peerState.lastUpdate = Date.now();
    }

    const name = this.peerStates.get(peerId)?.name || "Player";
    this.callbacks.onPeerPositionUpdate(peerId, position, heading, name);
  }

  private async handleWebRTCSignaling(message: ServerMessage) {
    switch (message.type) {
      case "Offer": {
        const fromId = message.from_player_id;
        const peerState = this.peerStates.get(fromId);
        const peerName = peerState?.name || "Unknown";

        // Create peer connection if it doesn't exist
        let peer = this.peers.get(fromId);
        if (!peer) {
          peer = await this.createPeerConnection(fromId, peerName);
        }

        const offer = JSON.parse(message.sdp);
        await peer.connection.setRemoteDescription(offer);

        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        this.signaling.sendAnswer(fromId, JSON.stringify(answer));
        break;
      }

      case "Answer": {
        const peer = this.peers.get(message.from_player_id);
        if (peer) {
          const answer = JSON.parse(message.sdp);
          await peer.connection.setRemoteDescription(answer);
        }
        break;
      }

      case "IceCandidate": {
        const peer = this.peers.get(message.from_player_id);
        if (peer) {
          const candidate = JSON.parse(message.candidate);
          await peer.connection.addIceCandidate(candidate);
        }
        break;
      }
    }
  }

  private closePeerConnection(peerId: string) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.dataChannel?.close();
      peer.connection.close();
      this.peers.delete(peerId);
    }
  }

  private closeAllConnections() {
    this.peers.forEach((_, peerId) => {
      this.closePeerConnection(peerId);
    });
    this.peerStates.clear();
  }
}

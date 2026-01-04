# Multiplayer WebRTC Implementation Plan

## Overview

Add peer-to-peer multiplayer racing using WebRTC mesh topology. Players in the same race session will see each other's boats in real-time.

## Architecture

### Topology
- **Mesh P2P** - Each player connects directly to every other player
- **Target:** 2-10 players per race
- **Transport:** WebRTC DataChannel (unreliable mode for position updates)

### Components
```
┌─────────────┐                    ┌─────────────┐
│  Player A   │◄───── WebRTC ─────►│  Player B   │
│   Browser   │                    │   Browser   │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       └──────────► Signaling ◄───────────┘
                   Server (Rust)
```

## Implementation Phases

### Phase 1: Signaling Server (Rust Backend)

**File:** `server/src/multiplayer.rs`

Add WebSocket endpoints for signaling:

```rust
// Data structures
struct Lobby {
    id: String,
    course_key: String,
    players: HashMap<String, Player>,
    max_players: usize,
    race_start_time: Option<i64>, // Unix timestamp in ms
}

struct Player {
    id: String,
    name: String,
    ws_connection: WebSocket,
}

// WebSocket messages
enum SignalingMessage {
    // Lobby management
    CreateLobby { course_key: String, player_name: String },
    JoinLobby { lobby_id: String, player_name: String },
    LeaveLobby,
    
    // WebRTC signaling
    Offer { target_player_id: String, sdp: String },
    Answer { target_player_id: String, sdp: String },
    IceCandidate { target_player_id: String, candidate: String },
    
    // Race coordination
    StartRace,
}

enum SignalingResponse {
    LobbyCreated { lobby_id: String, player_id: String },
    LobbyJoined { lobby_id: String, player_id: String, players: Vec<PlayerInfo> },
    PlayerJoined { player_id: String, player_name: String },
    PlayerLeft { player_id: String },
    
    // Forward WebRTC messages to target
    Offer { from_player_id: String, sdp: String },
    Answer { from_player_id: String, sdp: String },
    IceCandidate { from_player_id: String, candidate: String },
    
    // Race events
    RaceStarting { countdown: i32 }, // seconds until start
    RaceStarted { start_time: i64, wind_report_id: String },
}
```

**Endpoints:**
- `WS /multiplayer/lobby` - WebSocket connection for signaling

**Responsibilities:**
- Create and manage lobbies
- Route WebRTC signaling messages between peers
- Coordinate race start (countdown + synchronized start time)
- Provide canonical wind report ID to prevent drift

### Phase 2: WebRTC Manager (Client)

**File:** `client/src/multiplayer/webrtc-manager.ts`

```typescript
type PeerConnection = {
  id: string;
  name: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  lastPosition: LngLat | null;
  lastHeading: number | null;
  lastUpdate: number;
};

class WebRTCManager {
  private ws: WebSocket | null = null;
  private peers: Map<string, PeerConnection> = new Map();
  private myPlayerId: string | null = null;
  private onPeerUpdate: (peerId: string, position: LngLat, heading: number) => void;
  
  // Connect to signaling server
  async connect(lobbyId?: string, playerName?: string): Promise<string>;
  
  // WebRTC peer connection lifecycle
  private async createPeerConnection(peerId: string, peerName: string): Promise<void>;
  private async handleOffer(fromId: string, sdp: string): Promise<void>;
  private async handleAnswer(fromId: string, sdp: string): Promise<void>;
  private async handleIceCandidate(fromId: string, candidate: string): Promise<void>;
  
  // Data channel
  private setupDataChannel(peerId: string, channel: RTCDataChannel): void;
  private handleDataChannelMessage(peerId: string, data: ArrayBuffer): void;
  
  // Broadcasting
  broadcastPosition(position: LngLat, heading: number): void;
  
  // Cleanup
  disconnect(): void;
}
```

**Message Format (Binary for efficiency):**
```
Position Update (12 bytes):
[0-3]   float32 lng
[4-7]   float32 lat
[8-11]  float32 heading
```

### Phase 3: Multiplayer State Management

**File:** `client/src/app/multiplayer-state.ts`

```typescript
type MultiplayerState =
  | { tag: "Disconnected" }
  | { tag: "InLobby"; lobby: LobbyInfo }
  | { tag: "Racing"; lobby: LobbyInfo; raceStartTime: number };

type LobbyInfo = {
  id: string;
  course: Course;
  players: Map<string, PlayerInfo>;
  myPlayerId: string;
};

type PlayerInfo = {
  id: string;
  name: string;
  position: LngLat | null;
  heading: number | null;
  lastUpdate: number;
};

type MultiplayerAction =
  | { type: "CREATE_LOBBY"; playerName: string }
  | { type: "JOIN_LOBBY"; lobbyId: string; playerName: string }
  | { type: "LEAVE_LOBBY" }
  | { type: "PEER_JOINED"; playerId: string; playerName: string }
  | { type: "PEER_LEFT"; playerId: string }
  | { type: "PEER_POSITION_UPDATED"; playerId: string; position: LngLat; heading: number }
  | { type: "RACE_STARTED"; startTime: number };
```

**Integration with existing state:**
```typescript
// In app/state.ts
export type Session = {
  // ... existing fields
  multiplayer?: MultiplayerState;
};
```

### Phase 4: UI Components

**New Components:**

1. **`client/src/app/LobbyScreen.tsx`**
   - Show lobby ID (shareable link)
   - List connected players
   - "Start Race" button (visible to lobby creator)
   - Leave lobby button

2. **`client/src/app/MultiplayerMenu.tsx`**
   - "Create Race" button
   - "Join Race" input (lobby ID)
   - Player name input

3. **`client/src/sphere/ghost-boats.ts`**
   - Render other players' boats
   - Similar to `Boat` but with different color/opacity
   - Show player names above boats

### Phase 5: SphereView Integration

**File:** `client/src/sphere/index.ts`

```typescript
export class SphereView {
  // ... existing fields
  ghostBoats: GhostBoats;
  
  updatePeerPosition(playerId: string, position: LngLat, heading: number) {
    this.ghostBoats.updatePeer(playerId, position, heading);
    this.render();
  }
  
  removePeer(playerId: string) {
    this.ghostBoats.removePeer(playerId);
    this.render();
  }
}
```

**Render ghost boats in the render loop:**
```typescript
render() {
  // ... existing rendering
  this.ghostBoats.render(scene);
}
```

### Phase 6: App Integration

**File:** `client/src/app/App.tsx`

```typescript
// Create WebRTC manager ref
const webrtcManagerRef = useRef<WebRTCManager | null>(null);

// Initialize WebRTC manager when joining/creating lobby
useEffect(() => {
  if (state.tag !== "Playing") return;
  if (!state.session.multiplayer) return;
  
  const manager = new WebRTCManager(
    (peerId, position, heading) => {
      // Update peer position in state and sphere view
      dispatch({ type: "PEER_POSITION_UPDATED", playerId: peerId, position, heading });
      sphereViewRef.current?.updatePeerPosition(peerId, position, heading);
    }
  );
  
  webrtcManagerRef.current = manager;
  
  return () => manager.disconnect();
}, [state.session.multiplayer?.lobby?.id]);

// Broadcast position in animation loop
useEffect(() => {
  // ... existing animation loop
  
  // Add to tick function:
  if (webrtcManagerRef.current && positionRef.current) {
    webrtcManagerRef.current.broadcastPosition(
      positionRef.current,
      state.session.heading
    );
  }
}, [state.tag]);
```

## Data Flow

### Race Start Sequence
```
1. Player A creates lobby
   ├─► Signaling server creates lobby
   └─► Returns lobby_id

2. Player B joins with lobby_id
   ├─► Signaling server adds to lobby
   ├─► Notifies Player A: "Player B joined"
   └─► Player A initiates WebRTC connection to Player B
       ├─► Creates offer
       ├─► Sends offer via signaling
       └─► Player B answers
           └─► Direct P2P connection established

3. Player A clicks "Start Race"
   ├─► Signaling server broadcasts countdown
   ├─► All players see 3...2...1...
   └─► Server sends RaceStarted with:
       ├─► start_time (synchronized timestamp)
       └─► wind_report_id (canonical wind data)

4. Race begins
   └─► Each player broadcasts position every frame via WebRTC DataChannel
```

### Position Broadcasting (60 FPS)
```
Player A                    Player B                    Player C
   │                           │                           │
   ├─ broadcastPosition() ────►│                           │
   │                           │                           │
   ├──────────────────────────────────► broadcastPosition()│
   │                           │                           │
   │◄── position update ───────┤                           │
   │                           │                           │
   │◄───────────────────────────────── position update ────┤
```

## Implementation Checklist

### Backend (Rust)
- [ ] Add `warp` WebSocket support to dependencies
- [ ] Create `server/src/multiplayer.rs` module
- [ ] Implement `Lobby` data structure
- [ ] Add WebSocket endpoint `/multiplayer/lobby`
- [ ] Implement signaling message routing
- [ ] Add race start coordination logic
- [ ] Add lobby cleanup on disconnect

### Frontend
- [ ] Install WebRTC types: `npm install --save-dev @types/webrtc`
- [ ] Create `client/src/multiplayer/` directory
- [ ] Implement `WebRTCManager` class
- [ ] Add multiplayer state to `app/state.ts`
- [ ] Create `MultiplayerMenu` component
- [ ] Create `LobbyScreen` component
- [ ] Implement `GhostBoats` renderer
- [ ] Integrate WebRTC manager in `App.tsx`
- [ ] Add position broadcasting in animation loop
- [ ] Update `StartScreen` to show multiplayer options

### Testing
- [ ] Test 2-player race
- [ ] Test 5-player race
- [ ] Test player disconnect/reconnect
- [ ] Test late join (after race started)
- [ ] Test network latency simulation
- [ ] Test mobile data bandwidth

## Design Decisions

1. **Late joins:** Lock lobby when race starts
   - Players cannot join after race has begun
   - Simplifies state synchronization

2. **Lobby expiration:** Delete after 5 minutes of inactivity
   - Prevents server memory leaks
   - Reasonable time for players to gather

3. **Player names:** Store in localStorage (browser memory)
   - Persistent across sessions for convenience
   - Key: `rewind:player_name`

4. **Interpolation:** Show raw positions
   - No smoothing/interpolation of ghost boats
   - Simpler implementation, acceptable for sailing pace

5. **Bandwidth:** No throttling
   - Always broadcast at 60 FPS
   - Sailing game is low-bandwidth compared to action games

## Future Enhancements (Post-MVP)

- [ ] Leaderboard showing race positions
- [ ] Finish line detection and rankings
- [ ] Replay mode (save race data)
- [ ] Spectator mode (join without racing)
- [ ] Chat messages via reliable DataChannel
- [ ] Course waypoints (shared checkpoints)
- [ ] Ghost races (race against recorded players)
- [ ] SFU topology for >10 players

## Estimated Effort

- **Phase 1 (Signaling):** 4-6 hours
- **Phase 2 (WebRTC):** 6-8 hours
- **Phase 3 (State):** 2-3 hours
- **Phase 4 (UI):** 4-6 hours
- **Phase 5 (Rendering):** 3-4 hours
- **Phase 6 (Integration):** 3-4 hours
- **Testing & Polish:** 4-6 hours

**Total:** ~26-37 hours (3-5 days of focused work)

## Security Considerations

Since this is a toy game and we don't care about cheating:

- ✅ Skip position validation
- ✅ Skip anti-cheat measures
- ✅ Allow client-side position authority
- ⚠️ Still validate lobby joins (prevent joining full lobbies)
- ⚠️ Rate-limit lobby creation (prevent spam)

## References

- [WebRTC DataChannel API](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel)
- [Warp WebSocket Guide](https://github.com/seanmonstar/warp/blob/master/examples/websockets.rs)
- [WebRTC for Multiplayer Games](https://webrtc.ventures/2022/10/how-to-create-web-based-multiplayer-games-with-webrtc/)

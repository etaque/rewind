# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rewind is a sailing game simulation that replays offshore races (like Vendée Globe 2020) against real historical wind conditions, accelerated in time. Users experience riding weather systems around the world in minutes.

## Architecture

### Client (`client/`)

React + TypeScript application rendering a 3D interactive globe with real-time wind visualization.

#### Directory Structure

```
client/
├── src/
│   ├── app/                    # React application layer
│   │   ├── App.tsx             # Main component, state orchestration
│   │   ├── Hud.tsx             # In-game HUD (position, speed, wind)
│   │   ├── CursorWind.tsx      # Wind info tooltip following cursor
│   │   ├── LobbyScreen.tsx     # Multiplayer lobby UI
│   │   ├── courses.ts          # Race course definitions (start/finish, time factor)
│   │   ├── state.ts            # useReducer state management
│   │   ├── tick.ts             # Game physics tick (boat movement, TWA)
│   │   ├── tack.ts             # Tacking maneuver calculations
│   │   ├── twa-lock.ts         # TWA lock toggle logic
│   │   ├── polar.ts            # Boat speed from polar diagram
│   │   ├── land.ts             # Land collision detection
│   │   ├── hooks/              # Custom React hooks
│   │   │   ├── useKeyboardControls.ts  # Arrow keys, space for boat control
│   │   │   ├── useGameLoop.ts          # Animation loop, wind refresh
│   │   │   └── useMultiplayer.ts       # WebRTC manager and callbacks
│   │   └── lobby/              # Lobby UI components
│   │       ├── PlayerList.tsx
│   │       ├── AvailableLobbies.tsx
│   │       ├── CountdownDisplay.tsx
│   │       └── PlayerNameInput.tsx
│   ├── sphere/                 # 3D globe rendering
│   │   ├── index.ts            # SphereView orchestrator (creates canvases, D3 projection)
│   │   ├── land.ts             # Land masses + graticule via D3 geoPath
│   │   ├── wind-texture.ts     # WebGL wind heatmap (inverse orthographic projection)
│   │   ├── wind-particles.ts   # ~1000 animated particles showing wind flow
│   │   ├── boat.ts             # Player boat rendering
│   │   ├── boat-geometry.ts    # Shared boat polygon creation
│   │   ├── ghost-boats.ts      # Other players' boats
│   │   ├── wake.ts             # Boat wake trail
│   │   ├── shaders.ts          # WebGL vertex/fragment shaders
│   │   ├── scene.ts            # Scene configuration (projection, dimensions)
│   │   └── versor.ts           # Quaternion math for 3D rotation
│   ├── multiplayer/            # WebRTC multiplayer
│   │   ├── webrtc-manager.ts   # Peer connection management
│   │   ├── signaling.ts        # WebSocket signaling client
│   │   └── types.ts            # Multiplayer types
│   ├── models.ts               # TypeScript types (LngLat, WindSpeed, Course, etc.)
│   ├── interpolated-wind.ts    # Wind interpolation between reports
│   ├── wind-raster.ts          # Wind data loading from PNG
│   ├── utils.ts                # Helpers (wind calculations, coordinate math)
│   ├── styles.css              # Tailwind + custom component styles
│   └── index.tsx               # React DOM entry point
├── public/sphere/              # TopoJSON land data (110m, 50m resolutions)
├── vite.config.ts              # Dev server port 3000, env prefix REWIND_
├── tailwind.config.js          # Dark mode via class
└── tsconfig.json               # Strict TypeScript, ES2020 target
```

#### State Management

Uses `useReducer` with a three-state machine (`src/app/state.ts`):

| State | Description |
|-------|-------------|
| **Idle** | Initial state, auto-creates lobby |
| **Loading** | In lobby, fetching wind reports, waiting for race start |
| **Playing** | Active race session with animation loop |

Key Actions:
- `LOBBY_CREATED`, `LOBBY_JOINED` - Multiplayer lobby management
- `PLAYER_JOINED`, `PLAYER_LEFT` - Player roster updates
- `COUNTDOWN`, `RACE_STARTED` - Race start sequence
- `REPORTS_LOADED` - Wind data ready
- `TICK` - Game physics update
- `TURN`, `TACK`, `TOGGLE_TWA_LOCK` - Boat controls

#### 3D Rendering Layers

Three stacked HTML5 canvases (all at `#sphere` div):

1. **Land Canvas** (2D) - Coastlines, graticule grid via D3 geoPath
2. **Wind Texture Canvas** (WebGL) - Color heatmap of wind speeds
3. **Wind Particles Canvas** (2D) - Animated streaks following wind vectors

The `SphereView` class orchestrates all layers, handles D3 zoom/pan with quaternion rotation.

#### Wind Data Flow

```
Page loads → fetch /wind-reports/since/{time} → REPORTS_LOADED
    → InterpolatedWind.update(currentReport, nextReports)
    → WindRaster.load(reportId) → fetch /wind-reports/{id}/uv.png
    → Decode RGBA to u,v components → SphereView.updateWind()
    → Animation loop: query interpolatedWind.speedAt(position, time) every 100ms
```

Wind PNG format: 720×360 pixels (0.5° resolution), RGBA encodes u/v as `(n/255 * 60) - 30` m/s

#### Wind Particles System

The particle system (`src/sphere/wind-particles.ts`) visualizes wind flow with ~1000 animated particles that follow wind vectors.

**Constants:**
| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_AGE` | 1200 | Particle lifetime (ms) before respawning |
| `PARTICLES_COUNT` | 1000 | Number of particles in visible hemisphere |
| `ALPHA_DECAY` | 0.95 | Opacity multiplier per frame (creates trails) |
| `TRAVEL_SPEED` | 45 | Movement multiplier for wind vectors |
| `FPS` | 30 | Target frame rate |

**Particle Structure:**
- `pix`: Current screen pixel position
- `coord`: Current geo coordinate (lng/lat)
- `age`: Time since last respawn
- `visible`: Whether particle is on the visible hemisphere

**Animation Loop:**
1. Query wind speed at particle's geo position via `wind.speedAtWithFactor(coord, factor)`
2. Convert wind u/v components (m/s) to degree offsets
3. Update geo coordinate, project back to screen coordinates
4. Draw line segment from previous to current position
5. Apply trail effect by copying canvas at 95% opacity

**Respawn Behavior:**
When a particle's age exceeds MAX_AGE, it respawns at a new random position within the currently visible hemisphere. This ensures consistent particle density regardless of globe rotation.


#### Key Dependencies

- **React 18** - UI with hooks (useReducer, useRef, useEffect, useCallback)
- **D3 7** - Orthographic projection, zoom behavior, geoPath rendering
- **topojson-client** - Converts TopoJSON to GeoJSON features
- **Vite** - Bundler with HMR

### Server (`server/`)

Rust with Tokio async runtime, Warp HTTP framework, PostgreSQL 16 + PostGIS 3.4.

#### Directory Structure

```
server/
├── src/
│   ├── main.rs             # CLI entry point (clap), dispatches to commands
│   ├── cli.rs              # Command definitions (Http, Db, ImportGribRange)
│   ├── server.rs           # Warp routes and handlers
│   ├── db.rs               # Connection pooling (bb8 + tokio-postgres)
│   ├── multiplayer.rs      # WebSocket signaling for multiplayer races
│   ├── models.rs           # Domain types (WindReport, RasterRenderingMode)
│   ├── messages.rs         # JSON-serializable API DTOs
│   ├── grib_store.rs       # GRIB file import logic
│   └── repos/              # Database repositories
│       ├── mod.rs          # Generic from_rows() helper
│       ├── wind_reports.rs # Wind report CRUD operations
│       └── wind_rasters.rs # Raster rendering (PNG/WKB via PostGIS)
├── migrations/             # Refinery SQL migrations
├── Cargo.toml              # Dependencies (warp, tokio, postgis, etc.)
└── bin/                    # Shell scripts (container, dev-server)
```

#### HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Database health check |
| GET | `/wind-reports/since/{timestamp_ms}` | List wind reports after timestamp |
| GET | `/wind-reports/{uuid}/uv.png` | Wind UV components as PNG |
| GET | `/wind-reports/{uuid}/speed.png` | Wind speed magnitude as PNG |
| GET | `/wind-reports/{uuid}/raster.wkb` | Raw raster as WKB |
| WS | `/multiplayer/lobby` | WebSocket for multiplayer signaling |

#### Multiplayer Signaling (`multiplayer.rs`)

WebSocket-based lobby system for peer-to-peer racing:

**State Management:**
- `LobbyManager` - Thread-safe state with `Arc<RwLock<HashMap<String, Lobby>>>`
- `Lobby` - Players, course key, race state, activity timestamp
- `Player` - ID, name, mpsc channel for outbound messages

**Client → Server Messages:**
- `CreateLobby { course_key, player_name }` - Create new lobby
- `JoinLobby { lobby_id, player_name }` - Join existing lobby
- `LeaveLobby` - Leave current lobby
- `Offer/Answer/IceCandidate` - WebRTC signaling forwarding
- `StartRace` - Start race (creator only, requires 2+ players)

**Server → Client Messages:**
- `LobbyCreated/LobbyJoined` - Lobby state responses
- `PlayerJoined/PlayerLeft` - Player notifications
- `Offer/Answer/IceCandidate` - Forwarded WebRTC signaling
- `RaceCountdown { seconds }` - 3-2-1 countdown
- `RaceStarted { start_time, course_key }` - Synchronized race start

**Features:**
- 6-character hex lobby IDs
- Max 10 players per lobby
- Race locking (no joins after start)
- 5-minute expiration for empty lobbies

#### Database Schema

**Tables:**
- `wind_rasters` - UUID PK, PostGIS raster geometry (u/v bands)
- `wind_reports` - UUID PK, FK to raster, timestamps, GRIB metadata

**PostGIS Functions:**
- `ST_AsPNG()` - Raster to PNG conversion
- `ST_Reclass()` - Reclassify raster values for rendering

#### Key Dependencies

- **tokio 1.x** - Async runtime with full features
- **warp 0.3** - HTTP framework with WebSocket support
- **tokio-postgres 0.7** - Async PostgreSQL driver
- **bb8 0.8** - Connection pooling
- **postgis 0.9** - PostGIS type support
- **serde/serde_json** - JSON serialization
- **chrono** - Date/time handling
- **uuid** - UUID generation and parsing

## Development Commands

### Docker (recommended)
```bash
./server/bin/container up       # Start db + server, run migrations
./server/bin/container down     # Stop containers
./server/bin/container logs     # Follow logs
./server/bin/container psql     # PostgreSQL shell
./server/bin/container destroy  # Remove containers and volumes
```

### Client
```bash
cd client && npm install
cd client && npm run dev        # Vite dev server (port 3000)
cd client && npm run build      # Production build
```

### Server (manual)
```bash
cd server && cargo run -- http              # Start server
cd server && cargo run -- db migrate        # Run migrations
cd server && ./bin/dev-server               # With cargo-watch auto-reload
```

### Data Import
```bash
./server/scripts/vlm-vg20.sh    # Import Vendée Globe 2020 GRIB files
```

## Key Data Flow

1. Client loads → auto-creates multiplayer lobby via WebSocket
2. Wind reports fetched from server, wind texture displayed during lobby
3. Host starts race → countdown → all players begin simultaneously
4. Game loop ticks via `requestAnimationFrame`:
   - Query wind at boat position using interpolated wind data
   - Calculate boat speed from polar diagram (TWS + TWA → BSP)
   - Update boat position, broadcast to peers via WebRTC
5. Ghost boats rendered for other players in the race

## Speed Polars

A **polar diagram** shows a sailboat's potential speed for different combinations of wind speed (TWS) and wind angle (TWA). It's essential for calculating realistic boat movement.

### Key Concepts

- **TWS** (True Wind Speed): Wind speed in knots
- **TWA** (True Wind Angle): Angle between boat heading and wind direction (0° = into wind, 180° = downwind)
- **BSP** (Boat Speed): Resulting boat speed in knots, looked up from the polar
- **VMG** (Velocity Made Good): Speed component toward destination (useful for upwind/downwind optimization)

### Polar Data Format

Standard CSV/POL format:
```
TWA\TWS,6,8,10,12,14,16,20,25,30,35
0,0,0,0,0,0,0,0,0,0,0
30,4.5,5.2,5.8,6.1,6.3,6.5,6.7,6.8,6.9,6.9
45,5.8,6.5,7.2,7.6,7.9,8.1,8.4,8.6,8.7,8.8
60,6.2,7.1,7.9,8.5,9.0,9.4,9.9,10.3,10.5,10.6
90,6.5,7.8,9.0,10.2,11.5,12.8,15.0,17.5,19.0,20.0
120,6.3,7.9,9.8,12.0,14.5,17.0,21.0,24.0,26.0,27.0
150,5.8,7.2,9.0,11.0,13.5,16.0,19.5,22.5,24.0,25.0
180,4.5,5.8,7.5,9.5,12.0,14.5,17.5,20.0,21.0,21.0
```

- Row 1: TWS values (wind speeds in knots)
- Column 1: TWA values (wind angles in degrees)
- Cells: Boat speed (BSP) in knots

### IMOCA 60 Characteristics

Vendée Globe boats (IMOCA 60) are high-performance foiling monohulls:
- Can exceed wind speed, especially on broad reaches (90-130° TWA)
- Peak speeds ~27 knots at 130° TWA in 35 knots of wind
- Upwind (30° TWA): ~5-7 knots regardless of wind strength
- Dead downwind (180°) is slower than broad reaching - boats gybe downwind

### Usage in Simulation

To calculate boat speed:
1. Get TWS from wind data at boat position
2. Calculate TWA from boat heading and wind direction
3. Look up BSP from polar table (interpolate between values)
4. Move boat: `distance = BSP * timeDelta`

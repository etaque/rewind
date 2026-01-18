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
│   │   ├── RaceChoiceScreen.tsx # Race creation/joining UI
│   │   ├── Leaderboard.tsx     # Race standings display
│   │   ├── state.ts            # useReducer state management
│   │   ├── tick.ts             # Game physics tick (boat movement, TWA)
│   │   ├── tack.ts             # Tacking maneuver calculations
│   │   ├── twa-lock.ts         # TWA lock toggle logic
│   │   ├── vmg-lock.ts         # VMG lock calculations
│   │   ├── polar.ts            # Boat speed from polar diagram
│   │   ├── land.ts             # Land collision detection
│   │   ├── projected-path.ts   # Future boat path projection
│   │   ├── wind-context.ts     # Wind report context management
│   │   ├── hooks/              # Custom React hooks
│   │   │   ├── useKeyboardControls.ts  # Arrow keys, space for boat control
│   │   │   ├── useGameLoop.ts          # Animation loop, wind refresh
│   │   │   └── useMultiplayer.ts       # Multiplayer client callbacks
│   │   └── race/               # Race UI components
│   │       ├── PlayerList.tsx
│   │       ├── AvailableRaces.tsx
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
│   ├── multiplayer/            # Multiplayer networking
│   │   ├── client.ts           # WebSocket multiplayer client
│   │   ├── signaling.ts        # WebSocket signaling utilities
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

Uses `useReducer` with a four-state machine (`src/app/state.ts`):

| State | Description |
|-------|-------------|
| **Idle** | Initial state, no active race |
| **Loading** | In race lobby, wind raster sources loaded, waiting for race start |
| **Countdown** | Race countdown in progress (3-2-1), zoom to max triggered |
| **Playing** | Active race session with animation loop |

Key Actions:
- `RACE_CREATED`, `RACE_JOINED` - Multiplayer race management
- `PLAYER_JOINED`, `PLAYER_LEFT` - Player roster updates
- `COUNTDOWN` - Race countdown sequence (transitions Loading → Countdown → Playing)
- `START_PLAYING` - Transition to playing state
- `TICK` - Game physics update
- `TURN`, `TACK`, `TOGGLE_TWA_LOCK`, `VMG_LOCK` - Boat controls
- `SYNC_RACE_TIME`, `RACE_ENDED`, `LEADERBOARD_UPDATE` - Race synchronization

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
    → WindRaster.load(pngUrl) → fetch directly from S3
    → Decode RGB to u,v components → SphereView.updateWind()
    → Animation loop: query interpolatedWind.speedAt(position, time) every 100ms
```

Wind PNG format: 720×360 pixels (0.5° resolution), RGB encodes u/v as `(n/255 * 60) - 30` m/s

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

Rust with Tokio async runtime, Warp HTTP framework, and S3 for all storage (no database).

#### Directory Structure

```
server/
├── src/
│   ├── main.rs             # CLI entry point (clap), dispatches to commands
│   ├── cli.rs              # Command definitions (Http, ImportGribRange)
│   ├── server.rs           # Warp routes and handlers
│   ├── config.rs           # Environment configuration (S3, etc.)
│   ├── courses.rs          # Race course definitions (start/finish, time factor)
│   ├── manifest.rs         # Wind report manifest (JSON in S3)
│   ├── multiplayer.rs      # WebSocket signaling for multiplayer races
│   ├── s3.rs               # S3 client configuration
│   ├── grib_store.rs       # GRIB file import and S3 storage
│   └── grib_png.rs         # GRIB to PNG conversion
├── Cargo.toml              # Dependencies (warp, tokio, object_store, etc.)
└── bin/                    # Shell scripts (container, dev-server)
```

#### HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | S3 health check |
| GET | `/courses` | List available race courses |
| GET | `/multiplayer/races` | List active races |
| WS | `/multiplayer/race` | WebSocket for multiplayer signaling |

#### Multiplayer Signaling (`multiplayer.rs`)

WebSocket-based race system for multiplayer racing:

**State Management:**
- `RaceManager` - Thread-safe state with `Arc<RwLock<HashMap<String, Race>>>`
- `Race` - Course, wind raster sources, players, race state, activity timestamp
- `Player` - ID, name, mpsc channel for outbound messages, position

**Client → Server Messages:**
- `CreateRace { course_key, player_name }` - Create new race
- `JoinRace { race_id, player_name }` - Join existing race
- `LeaveRace` - Leave current race
- `StartRace` - Start race (creator only)
- `PositionUpdate { lng, lat, heading }` - Broadcast boat position

**Server → Client Messages:**
- `RaceCreated { race_id, player_id, wind_raster_sources }` - Race created response
- `RaceJoined { race_id, player_id, course_key, wind_raster_sources, players, is_creator }` - Race joined response
- `PlayerJoined/PlayerLeft` - Player notifications
- `RaceCountdown { seconds }` - 3-2-1 countdown
- `PositionUpdate { player_id, lng, lat, heading }` - Other player positions
- `SyncRaceTime { race_time }` - Server time synchronization
- `RaceEnded { reason }` - Race completion notification
- `Leaderboard { entries }` - Current race standings

**Features:**
- 6-character hex race IDs
- Max 10 players per race
- Race locking (no joins after start)
- 5-minute expiration for empty races
- Wind raster sources sent on race create/join

#### S3 Storage

All data is stored in S3 (no database required):

| Bucket | Purpose | Access |
|--------|---------|--------|
| `grib-files` | Raw GRIB files downloaded from NOAA | Private (server cache) |
| `wind-rasters` | Processed UV PNG files + manifest.json | Public read (client access) |

**Manifest file (`manifest.json`):**
```json
{
  "reports": [
    {"time": 1604210400000, "gribPath": "2020/1101/0/3/gfs...", "pngPath": "2020/1101/0/3/uv.png"},
    ...
  ]
}
```

The manifest is updated on each GRIB import and read by the server to serve `/wind-reports/since/{time}`.

**PNG format:** 720×360 pixels (0.5° resolution), RGB where R=u, G=v components encoded as `(value + 30) * 255 / 60`

#### Key Dependencies

- **tokio 1.x** - Async runtime with full features
- **warp 0.3** - HTTP framework with WebSocket support
- **object_store** - S3 client (MinIO compatible)
- **grib** - GRIB2 file parsing
- **png** - PNG encoding
- **serde/serde_json** - JSON serialization
- **chrono** - Date/time handling

## Development Commands

### Docker (recommended)
```bash
./server/bin/container up       # Start minio container
./server/bin/container down     # Stop containers
./server/bin/container logs     # Follow logs
./server/bin/container minio    # Open MinIO console in browser
./server/bin/container destroy  # Remove containers and volumes
```

### Local S3 (MinIO)

MinIO provides S3-compatible object storage for local development:

| Service | URL | Credentials |
|---------|-----|-------------|
| S3 API | http://localhost:9000 | rewind / rewindpass |
| Web Console | http://localhost:9001 | rewind / rewindpass |

Two buckets are auto-created on startup:
- `grib-files` - Private bucket for GRIB file cache
- `wind-rasters` - Public bucket for processed PNG files (CORS enabled)

### Client
```bash
cd client && npm install
cd client && npm run dev        # Vite dev server (port 3000)
cd client && npm run build      # Production build
```

### Server (manual)
```bash
cd server && cargo run -- http              # Start server
cd server && ./bin/dev-server               # With cargo-watch auto-reload
```

### Data Import
```bash
cd server && cargo run -- import-grib-range --from 2020-11-01 --to 2021-01-27
```

## Key Data Flow

1. Client loads → creates/joins multiplayer race via WebSocket
2. Server sends wind raster sources on race create/join, wind texture displayed during lobby
3. Host starts race → countdown (zoom to max) → all players begin simultaneously
4. Game loop ticks via `requestAnimationFrame`:
   - Query wind at boat position using interpolated wind data
   - Calculate boat speed from polar diagram (TWS + TWA → BSP)
   - Update boat position, broadcast to server via WebSocket
5. Server broadcasts position updates to other players, ghost boats rendered

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

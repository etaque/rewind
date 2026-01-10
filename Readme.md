# Rewind

Multiplayer sailing game: offshore races against real historical wind conditions, accelerated in time. Ride weather systems around the world in minutes.

## Features

- **Real wind data** - Historical GRIB wind forecasts from Vendée Globe 2020
- **Multiplayer** - WebRTC peer-to-peer racing with lobby system
- **Realistic physics** - IMOCA 60 polar diagrams for boat speed
- **3D globe** - Interactive Earth with wind visualization (particles + heatmap)
- **Boat controls** - Arrow keys to steer, space to tack, up arrow to lock TWA

## Development

Create a `.env` at root from `sample.env`.

### Prerequisites

Install cargo-watch for auto-reload:

```bash
cargo install cargo-watch
```

### Start Services

Start database and tile server:

```bash
./server/bin/container up
```

Run migrations and start the server:

```bash
cd server
cargo run -- db migrate
./bin/dev-server
```

Start the client:

```bash
cd client
npm install
npm run dev
```

**Ports:**
- Client: http://localhost:3000
- Server: http://localhost:3001
- PostgreSQL: localhost:25432
- Minio: http://localhost:9000

### Container Commands

```bash
./server/bin/container up       # Start db and minio
./server/bin/container down     # Stop containers
./server/bin/container logs     # Follow logs
./server/bin/container psql     # PostgreSQL shell
./server/bin/container migrate  # Run migrations
./server/bin/container destroy  # Remove containers and volumes
```

## Tech Stack

**Client:**
- React 18 + TypeScript
- Vite
- D3.js for globe projection and zoom/pan
- WebGL for wind texture rendering
- WebRTC for peer-to-peer multiplayer
- Tailwind CSS

**Server:**
- Rust with Tokio async runtime
- Warp web framework (HTTP + WebSocket)
- PostgreSQL 16 + PostGIS 3.4 for wind raster data

## Scripts

Import Vendée Globe 2020 GRIB files:

```bash
./server/scripts/vlm-vg20.sh
```

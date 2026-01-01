# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rewind is a sailing game simulation that replays offshore races (like Vendée Globe 2020) against real historical wind conditions, accelerated in time. Users experience riding weather systems around the world in minutes.

## Architecture

**Client** (`client/`): React + TypeScript
- React app (`src/app/`) with `useReducer` for state management (Idle/Loading/Playing states)
- TypeScript (`src/sphere/`) renders a 3D globe with D3.js projections, WebGL wind particles, and land masses from TopoJSON
- Vite for bundling; Tailwind CSS for styling

**Server** (`server/`): Rust with Tokio async runtime
- Warp HTTP server with WebSocket support
- PostgreSQL 16 + PostGIS 3.4 for storing wind raster data
- GRIB file parser for importing meteorological data

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

1. Client loads, user clicks start → React fetches wind reports from server
2. Server returns wind report metadata from PostGIS
3. Client loads wind UV data as PNG, renders as animated particles on globe
4. Game loop ticks via `requestAnimationFrame`, queries wind at boat position
5. Wind speed used for gameplay calculations

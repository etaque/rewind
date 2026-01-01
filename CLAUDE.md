# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rewind is a sailing game simulation that replays offshore races (like Vendée Globe 2020) against real historical wind conditions, accelerated in time. Users experience riding weather systems around the world in minutes.

## Architecture

**Client** (`client/`): Elm + TypeScript hybrid
- Elm app (`src/app/`) handles UI state, game loop, and HTTP requests to server
- TypeScript (`src/sphere/`) renders a 3D globe with D3.js projections, WebGL wind particles, and land masses from TopoJSON
- Communication between Elm and TypeScript via ports (`requests`/`responses`)
- Webpack bundles everything; TailwindCSS for styling

**Server** (`server/`): Rust with Tokio async runtime
- Warp HTTP server with WebSocket support
- PostgreSQL + PostGIS for storing wind raster data
- GRIB file parser for importing meteorological data
- Tile server for serving map tiles

## Development Commands

### Prerequisites
Dependencies managed via Nix (`shell.nix`). Use `nix-shell` or direnv. Create `.env` from `sample.env`.

### Database
```bash
docker-compose up -d                    # Start PostgreSQL/PostGIS
cd server && cargo run -- db migrate    # Run migrations
cd server && cargo run -- db reset      # Reset database
```

### Server
```bash
cd server && ./bin/dev-server           # Main server (uses cargo watch)
cd server && ./bin/tile-server          # Tile server
```

### Client
```bash
cd client && npm install
cd client && ./bin/dev-server           # Webpack dev server (npm start)
cd client && npm run build              # Production build
```

### Data Import
```bash
./server/scripts/vlm-vg20.sh            # Import Vendée Globe 2020 GRIB files
```

## Key Data Flow

1. Client loads, user clicks start → Elm requests wind reports from server
2. Server returns wind report metadata from PostGIS
3. TypeScript loads wind UV data, renders as animated particles on globe
4. Game loop ticks via `Browser.Events.onAnimationFrameDelta`, queries wind at boat position
5. Wind speed returned to Elm via ports for gameplay calculations

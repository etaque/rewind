# Rewind

Game exploration: offshore sail races, against real wind conditions, but accelerated: riding from depression to depression, around the world, in a few minutes.

## Development

Create a `.env` at root from `sample.env`.

### Docker (recommended)

Start everything with Docker Compose:

```bash
./server/bin/container up
```

This starts PostgreSQL/PostGIS and the Rust server, and runs database migrations.

Other commands:

```bash
./server/bin/container logs     # Follow logs
./server/bin/container psql     # PostgreSQL shell
./server/bin/container down     # Stop containers
./server/bin/container destroy  # Remove containers and volumes
```

### Client

```bash
cd client
npm install
npm run dev
```

The client runs on http://localhost:3000.

### Manual Setup

If you prefer running services manually:

#### Database

Requirements:
- PostgreSQL 16+ with PostGIS 3.4+
- Extensions: `postgis`, `hstore`, `postgis_raster`
- GDAL drivers enabled

Start database only:

```bash
docker compose up -d db
```

Run migrations:

```bash
cd server
cargo run -- db migrate
```

#### Server

```bash
cd server
cargo run -- http
```

Or with auto-reload:

```bash
cd server
./bin/dev-server
```

## Tech Stack

**Client:**
- React 18 + TypeScript
- Vite
- D3.js for globe projection
- WebGL for wind visualization
- Tailwind CSS

**Server:**
- Rust with Tokio async runtime
- Warp web framework
- PostgreSQL + PostGIS for wind raster data

## Scripts

Import Vendée Globe 2020 GRIB files:

```bash
./server/scripts/vlm-vg20.sh
```

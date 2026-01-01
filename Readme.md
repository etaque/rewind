# Rewind

Game exploration: offshore sail races, against real wind conditions, but accelerated: riding from depression to depression, around the world, in a few minutes.

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
- Martin (tile server): http://localhost:3002
- PostgreSQL: localhost:25432

### Container Commands

```bash
./server/bin/container up       # Start db and martin
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
- D3.js for globe projection
- WebGL for wind visualization
- Tailwind CSS

**Server:**
- Rust with Tokio async runtime
- Warp web framework
- PostgreSQL + PostGIS for wind raster data
- Martin for vector tiles

## Scripts

Import Vendée Globe 2020 GRIB files:

```bash
./server/scripts/vlm-vg20.sh
```

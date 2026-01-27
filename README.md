# Rewind

Multiplayer sailing game: offshore races against real historical wind conditions, accelerated in time. Ride weather systems around the world in minutes.

## Features

- **Real wind data** - Historical GRIB wind forecasts from Vendée Globe 2020
- **Multiplayer** - WebSocket-based racing with server-authoritative positions
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

Start Minio:

```bash
./server/bin/container up
```

Start the server:

```bash
cd server
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
- Minio: http://localhost:9000

### Container Commands

```bash
./server/bin/container up       # Start minio
./server/bin/container down     # Stop containers
./server/bin/container logs     # Follow logs
./server/bin/container migrate  # Run migrations
./server/bin/container destroy  # Remove containers and volumes
```

## Tech Stack

**Client:**
- React 18 + TypeScript
- Vite
- D3.js for globe projection and zoom/pan
- WebGL for wind texture rendering
- Tailwind CSS

**Server:**
- Rust with Tokio async runtime
- Axum web framework (HTTP + WebSocket)
- SQLite for wind report inventory
- S3 for wind raster storage

## Infrastructure

### Requirements

- AWS account with credentials configured
- Terraform
- Fly.io CLI (`fly`) authenticated

### Provisioning

**AWS (S3 + CloudFront):**

```bash
cd infra
terraform init
terraform apply
```

This creates:
- ACM certificate for `rewind.milox.dev`
- S3 buckets for GRIB files and wind rasters
- CloudFront distribution for the client

After `terraform apply`, add DNS records in your DNS provider:
- `rewind` CNAME → CloudFront domain (from `terraform output cloudfront_domain`)
- ACM validation CNAMEs (from `terraform output acm_validation_records`)

**Fly.io (Server):**

```bash
cd server
fly launch --no-deploy

# Create volume for SQLite database
fly volumes create rewind_data --region cdg --size 1

# Set secrets
fly secrets set \
  RUST_LOG=info \
  REWIND_S3_GRIB_BUCKET=rewind-gribs \
  REWIND_S3_RASTER_BUCKET=rewind-wind-rasters \
  REWIND_S3_ENDPOINT=https://s3.eu-west-3.amazonaws.com \
  REWIND_S3_REGION=eu-west-3 \
  REWIND_S3_ACCESS_KEY=<from terraform> \
  REWIND_S3_SECRET_KEY=<from terraform>
```

The `fly.toml` is pre-configured to mount the volume at `/data` with `REWIND_DB_PATH=/data/rewind.db`.

## Deployment

### Client

Requires AWS CLI with profile `rewind-frontend-uploader` configured:

```bash
aws configure --profile rewind-frontend-uploader
# Use access key from: terraform state show aws_iam_access_key.frontend_uploader
# Use secret from: terraform output frontend_uploader_secret
```

Deploy:

```bash
./client/bin/deploy
```

### Server

```bash
./server/bin/deploy
```

## Scripts

Import GRIB files for courses defined in server:

```bash
fly ssh console
rewind import-courses-gribs
```

Rebuild wind report database from existing S3 PNG files:

```bash
fly ssh console
rewind rebuild-manifest
```

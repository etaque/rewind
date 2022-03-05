# Rewind

Game exploration: offshore sail races, against real wind conditions, but accelerated: riding from depression to depression, around the world, in a few minutes. 

## Development

All dependencies are declared in `shell.nix`. Either enter `nix-shell` ([or use direnv](https://github.com/nix-community/nix-direnv) or install them by hand.

Create a `.env` at root from `sample.env`. 

### Database

Required features:

 * PostgreSQL 11
 * Postgis with [GDAL drivers enabled](https://postgis.net/docs/postgis_gdal_enabled_drivers.html)
 * Extensions `postgis`, `hstore` and `postgis_raster` created in DB

Migrations:

```
cd server
cargo run -- db migrate
```

#### Docker instance

Docker container with postgis/postgres/gdal available with:

```
docker-compose up -d
```

Connect via psql :

```
psql rewind -U rewind --port 25432 -h localhost --password
# password rewind
```

#### Nix container

A NixOS container is available, see `./server/bin/container`.

### Server

- Main server:

```
cd server
./bin/dev-server
```

- Tile server:

```
cd server
./bin/tile-server
```

### Client

```
cd client
npm install
./bin/dev-server
```

## Scripts

* Import Vendée Globe 2020 GRIB files:
  
``` 
./server/scripts/vlm-vg20.sh
```

* Load coastal lines (useless in current state of project):

```
./server/scripts/import-osm.sh
```

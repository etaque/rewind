# Rewind

## Development

All dependencies are declared in `shell.nix`. Either enter `nix-shell` ([or use direnv](https://github.com/nix-community/nix-direnv) or install them by hand.

Create a `.env` at root from `sample.env`. 

### Database

Required:

 * PostgreSQL 11
 * Postgis with [GDAL drivers enabled](https://postgis.net/docs/postgis_gdal_enabled_drivers.html)
 * Extensions `postgis`, `hstore` and `postgis_raster` created in DB

A NixOS container already configured with these settings, see `./server/bin/container`.

Migrations:

```
cd server
cargo run -- db migrate
```

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

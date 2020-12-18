# Rewind

## Development

All dependencies are declared in `shell.nix`. Either enter `nix-shell` ([or use direnv](https://github.com/nix-community/nix-direnv) or install them by hand.

Create a `.env` at root from `sample.env`. A NixOS container for Postgres can be started with `server/bin/container`.

Main server:

    $ cd server && ./bin/dev-server

Tile server:

    $ cd server && ./bin/tile-server

Client:

    $ cd client && ./bin/dev-server

## Scripts

* Load coastal lines:

    $ ./server/scripts/import-osm.sh

* Import Vendée Globe 2020 GRIB files:
  
    WIP


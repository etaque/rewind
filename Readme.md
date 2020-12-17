# Rewind

## Development

All dependencies are declared in `shell.nix`. Either enter `nix-shell` ([hint](https://github.com/nix-community/nix-direnv) or install them by hand.

Backend (`sudo` will be required to initialize NixOS container on first start):

    $ cd backend && ./bin/dev-server

Tile server:

    $ cd backend && ./bin/tile-server

Frontend:

    $ cd frontend && ./bin/dev-server

## Resources

  - [GRIB archives](https://grib.v-l-m.org/archives/)
  - Legacy attempt: [etaque/offshore](https://github.com/etaque/offshore) 

### Coastal data

[Wiki](https://wiki.openstreetmap.org/wiki/Coastline) and [data](https://osmdata.openstreetmap.de/data/land-polygons.html)

    wget https://osmdata.openstreetmap.de/download/simplified-land-polygons-complete-3857.zip
    unzip simplified-land-polygons-complete-3857.zip
    shp2pgsql -d -I -s 3857 simplified-land-polygons-complete-3857/simplified_land_polygons.shp osm_simple_land | psql -U rewind -h 10.233.1.2 rewind
  

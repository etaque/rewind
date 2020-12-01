# Rewind

## Development

Start backend and services with:

    backend/bin/dev-server

Sudo will be required to initialize NixOS container on first start.

### Coastal data

    wget https://osmdata.openstreetmap.de/download/simplified-land-polygons-complete-3857.zip
    unzip simplified-land-polygons-complete-3857.zip
    shp2pgsql -d -I -s 3857 simplified-land-polygons-complete-3857/simplified_land_polygons.shp osm_simple_land | psql -U rewind -h 10.233.1.2 rewind

## Deployment

### Local VM

Start and provision the VM with:

    cd backend
    vagrant up

### Production

Provision EC2 instance with:

    cd backend/ops
    ansible-playbook -i hosts.yml \
      --extra-vars "@secrets/shared.yml" \
      --extra-vars "@secrets/prod.yml" \
      deploy-prod.yml


## Resources

  - [GRIB1 archives](https://grib.v-l-m.org/archives/)
  - Coastal data: [wiki](https://wiki.openstreetmap.org/wiki/Coastline) and [data](https://osmdata.openstreetmap.de/data/land-polygons.html)
  - Legacy attempt: [etaque/offshore](https://github.com/etaque/offshore) 

  

#!/usr/bin/env bash
set -e

cd $(dirname "$0")/..

set -a
source ../.env
set +a

SHP_NAME=simplified-land-polygons-complete
SRID=3857
TMP=/tmp

# source: https://wiki.openstreetmap.org/wiki/Coastline
wget https://osmdata.openstreetmap.de/download/$SHP_NAME-$SRID.zip -O $TMP/$SHP_NAME.zip
unzip -o $TMP/$SHP_NAME.zip -d $TMP
shp2pgsql -I -s $SRID $TMP/$SHP_NAME-$SRID/simplified_land_polygons.shp $SHP_NAME | psql

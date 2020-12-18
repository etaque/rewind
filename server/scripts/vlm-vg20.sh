#!/usr/bin/env bash
set -uo pipefail 

cd $(dirname "$0")/..
make

FROM=${1:-2020-11-08}
TO=$(date --date=${2:-yesterday} +'%Y-%m-%d')

DAY="$FROM"

while [ "$DAY" != 2020-12-18 ]; do 
  BASE_URL="https://grib.v-l-m.org/archives/$(date --date="$DAY" +'%Y/%m%d')/"
  FORECAST=3
  echo $BASE_URL

  for i in {0..3}; do
    HOUR=$(expr $i \* 6)
    FILE=gfs.t$(printf '%02i' $HOUR)z.pgrb2full.0p50.f$(printf '%03i' $FORECAST).grib2
    echo "  $FILE"

    dist/rewind grib --silent \
      --url $BASE_URL$FILE \
      --day $DAY \
      --hour $HOUR \
      --forecast $FORECAST
  done

  DAY=$(date -I -d "$DAY + 1 day")
done

echo "Finished."
echo

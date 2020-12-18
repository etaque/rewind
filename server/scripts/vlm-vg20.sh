#!/usr/bin/env bash
set -uo pipefail 

cd $(dirname "$0")/..

FROM=${1:-2020-11-08}
TO=$(date --date=${2:-yesterday} +'%Y-%m-%d')

DAY="$FROM"

while [ "$DAY" != 2020-12-18 ]; do 
  printf $DAY

  BASE_URL="https://grib.v-l-m.org/archives/$(date --date="$DAY" +'%Y/%m%d')/"
  FORECAST=3

  for i in {0..3}; do

    HOUR=$(expr $i \* 6)
    URL="${BASE_URL}gfs.t$(printf '%02i' $HOUR)z.pgrb2full.0p50.f$(printf '%03i' $FORECAST).grib2"
    printf "\t$URL"

    cargo run -- grib \
      --url $URL \
      --day $DAY \
      --hour $HOUR \
      --forecast $FORECAST
  done

  DAY=$(date -I -d "$DAY + 1 day")
done

printf "Finished."
printf "\n"

#!/bin/sh

for i in {0..3}; do 
  h=$(expr $i \* 6)
  echo "Syncing at $h..."
  curl -X PUT http://localhost:9060/gribs/sync-at/$1/$h;
  echo
done

import "mapbox-gl/dist/mapbox-gl.css";
import { DeckGL } from "@deck.gl/react";
import { StaticMap } from "react-map-gl";
import * as React from "react";
// @ts-expect-error
import { BASEMAP } from "@deck.gl/carto";

const INITIAL_VIEW_STATE = {
  latitude: 51.47,
  longitude: 0.45,
  zoom: 4,
  bearing: 0,
  pitch: 0,
};

export default function Map() {
  return (
    <DeckGL initialViewState={INITIAL_VIEW_STATE} controller={true} layers={[]}>
      <StaticMap width="100%" height="100%" mapStyle={BASEMAP.POSITRON} />
    </DeckGL>
  );
}

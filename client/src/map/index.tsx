import "mapbox-gl/dist/mapbox-gl.css";
import { DeckGL } from "@deck.gl/react";
import { StaticMap } from "react-map-gl";
import * as React from "react";
import * as ReactDOM from "react-dom";
// @ts-expect-error
import { BASEMAP } from "@deck.gl/carto";
import { InitialViewStateProps } from "@deck.gl/core/lib/deck";

import { LngLat } from "../models";

export type MapProps = {
  initialViewState: Partial<InitialViewStateProps>;
  layers: any[];
};

export function View(props: MapProps) {
  return (
    <DeckGL
      initialViewState={props.initialViewState}
      controller={true}
      layers={props.layers}
    >
      <StaticMap width="100%" height="100%" mapStyle={BASEMAP.POSITRON} />
    </DeckGL>
  );
}

export function renderMap(node: HTMLElement, { lng, lat }: LngLat) {
  const props = {
    initialViewState: { zoom: 4, longitude: lng, latitude: lat },
    layers: [],
  };
  let map: React.ReactElement = React.createElement(View, props);
  ReactDOM.render(map, node);
}

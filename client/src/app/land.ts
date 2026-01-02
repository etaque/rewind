import Index from "flatbush";
import { feature } from "topojson-client";
import { geoContains, geoBounds } from "d3-geo";
import type {
  FeatureCollection,
  Polygon,
  MultiPolygon,
  GeoJsonProperties,
} from "geojson";
import landData from "../static/land-110m.json";
import { Topology, Objects, Point } from "topojson-specification";

type LandFeature = {
  type: "Feature";
  geometry: Polygon | MultiPolygon;
  properties: GeoJsonProperties;
};

let flatbushIndex: Index | null = null;
let landFeatures: LandFeature[] = [];
let initPromise: Promise<void> | null = null;

export function initLandData(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve) => {
    const land = feature(
      landData as unknown as Topology<Objects<GeoJsonProperties>>,
      landData.objects.land as unknown as Point<GeoJsonProperties>,
    ) as unknown as FeatureCollection<
      Polygon | MultiPolygon,
      GeoJsonProperties
    >;

    const index = new Index(land.features.length);

    land.features.forEach((f) => {
      const [[minX, minY], [maxX, maxY]] = geoBounds(f);
      index.add(minX, minY, maxX, maxY);
    });

    index.finish();

    flatbushIndex = index;
    landFeatures = land.features as LandFeature[];
    resolve();
  });

  return initPromise;
}

export function isPointOnLand(lng: number, lat: number): boolean {
  if (!flatbushIndex) return false;

  const ids = flatbushIndex.search(lng, lat, lng, lat);
  return ids.some((id) => geoContains(landFeatures[id], [lng, lat]));
}

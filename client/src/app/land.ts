import Index from "flatbush";
import { feature } from "topojson-client";
import { geoContains, geoBounds } from "d3-geo";
import type {
  FeatureCollection,
  Polygon,
  MultiPolygon,
  GeoJsonProperties,
} from "geojson";
import landData from "../static/land-50m.json";
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

    const individualFeatures: LandFeature[] = land.features.flatMap((f) => {
      if (f.geometry.type === "MultiPolygon") {
        return f.geometry.coordinates.map(
          (coords): LandFeature => ({
            type: "Feature",
            geometry: { type: "Polygon", coordinates: coords },
            properties: f.properties,
          }),
        );
      }
      return [f as LandFeature];
    });

    const index = new Index(individualFeatures.length);

    individualFeatures.forEach((f) => {
      const [[west, south], [east, north]] = geoBounds(f);
      // geoBounds returns west > east for polygons crossing the antimeridian.
      // Flatbush requires minX <= maxX, so expand to full longitude range.
      const minX = west <= east ? west : -180;
      const maxX = west <= east ? east : 180;
      index.add(minX, south, maxX, north);
    });

    index.finish();

    flatbushIndex = index;
    landFeatures = individualFeatures;
    resolve();
  });

  return initPromise;
}

export function isPointOnLand(lng: number, lat: number): boolean {
  if (!flatbushIndex) return false;

  const ids = flatbushIndex.search(lng, lat, lng, lat);
  return ids.some((id) => geoContains(landFeatures[id], [lng, lat]));
}

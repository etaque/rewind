import { geoContains } from "d3-geo";
import { ExclusionZone } from "../models";

type PreparedZone = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  geoJson: GeoJSON.Feature<GeoJSON.Polygon>;
};

let preparedZones: PreparedZone[] | null = null;

export function prepareExclusionZones(zones: ExclusionZone[]): void {
  preparedZones = zones.map((zone) => {
    const lngs = zone.polygon.map((p) => p.lng);
    const lats = zone.polygon.map((p) => p.lat);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
      geoJson: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [zone.polygon.map((p) => [p.lng, p.lat])],
        },
      } as GeoJSON.Feature<GeoJSON.Polygon>,
    };
  });
}

export function isPointInExclusionZone(lng: number, lat: number): boolean {
  if (!preparedZones) return false;

  for (const zone of preparedZones) {
    // Quick bounding box rejection (O(1))
    if (
      lat > zone.maxLat ||
      lat < zone.minLat ||
      lng < zone.minLng ||
      lng > zone.maxLng
    ) {
      continue;
    }
    // Expensive polygon test only if inside bounding box
    if (geoContains(zone.geoJson, [lng, lat])) {
      return true;
    }
  }
  return false;
}

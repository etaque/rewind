import parseRaster, { Raster, Rasterband } from "wkb-raster";
import { LngLat, WindSpeed, GenericWindRaster } from "./models";

const serverUrl = process.env.REWIND_SERVER_URL!;

export type WindRaster = Raster;

export async function load(reportId: string): Promise<WindRaster> {
  const data = await fetch(`${serverUrl}/wind-reports/${reportId}/raster.wkb`);
  const blob = await data.blob();
  const buf = await blob.arrayBuffer();
  return parseRaster(buf);
}

export function speedAt(raster: WindRaster, position: LngLat): WindSpeed {
  if (raster.bands.length == 2) {
    const u = valueAt(raster.bands[0], position);
    const v = valueAt(raster.bands[1], position);
    console.log(u, v);
    return { u, v };
  } else {
    return { u: 0, v: 0 };
  }
}

const rowLength = 720;

function valueAt(band: Rasterband, { lng, lat }: LngLat): number {
  const lngIndex = Math.round(2 * (lng + 180));
  const latIndex = Math.round(2 * (lat + 90));
  return band.data[latIndex * rowLength + lngIndex];
}

export default { load, speedAt } as GenericWindRaster<Raster>;

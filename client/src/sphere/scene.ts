import { Pixel } from "../models";
import * as d3 from "d3";

export const sphere: d3.GeoSphere = { type: "Sphere" };

export type Scene = {
  projection: d3.GeoProjection;
  width: number;
  height: number;
  sphereRadius: number;
  sphereCenter: Pixel;
};

export const sphereRadius = (projection: d3.GeoProjection): number => {
  const [[x0], [x1]] = d3.geoPath(projection).bounds(sphere);
  return (x1 - x0) / 2;
};

export const sphereCenter = (projection: d3.GeoProjection): Pixel => {
  const [x, y] = d3.geoPath(projection).centroid(sphere);
  return { x, y };
};

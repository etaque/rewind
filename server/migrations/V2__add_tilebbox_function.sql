/*
https://github.com/mapbox/postgis-vt-util/blob/master/src/TileBBox.sql

Given a Web Mercator tile ID as (z, x, y), returns a bounding-box
geometry of the area covered by that tile.
*/
CREATE OR REPLACE FUNCTION TileBBox (z int, x int, y int, srid int = 3857)
RETURNS geometry AS $$
DECLARE
  max numeric := 20037508.34;
  res numeric := (max*2)/(2^z);
  bbox geometry;
BEGIN
  bbox := ST_MakeEnvelope(
    -max + (x * res),
    max - (y * res),
    -max + (x * res) + res,
    max - (y * res) - res,
    3857
  );
  if srid = 3857 then
    return bbox;
  else
    return ST_Transform(bbox, srid);
  end if;
END;
$$ LANGUAGE plpgsql IMMUTABLE ;


CREATE OR REPLACE FUNCTION MapWindSpeed (rast raster) RETURNS raster AS $$
SELECT ST_MapAlgebra(rast, 1, rast, 2, 'sqrt([rast1] ^ 2 + [rast2] ^2)', '64BF')
$$ LANGUAGE SQL;


CREATE OR REPLACE FUNCTION wind_tiles(z integer, x integer, y integer, query_params json) RETURNS bytea AS $$
DECLARE
  mvt bytea;
  -- local copies to avoid naming conflicts with ST_PixelAsPoints
  _x integer := x;
  _y integer := y;
BEGIN
  SELECT INTO mvt ST_AsMVT(tile, 'wind', 4096, 'geom') FROM (
    SELECT
      ST_AsMVTGeom(ST_Transform(ST_ShiftLongitude(geom), 3857), TileBBox(z, _x, _y, 3857), 4096, 64, true) AS geom,
      val
    FROM (
      SELECT (ST_PixelAsPoints(ST_Clip(rast, ST_ShiftLongitude(TileBBox(z, _x, _y, 4326))))).*
      FROM wind_rasters 
      JOIN wind_reports on raster_id = wind_rasters.id 
      WHERE wind_reports.id = (query_params->>'wind_report_id')::uuid
    ) as pix_points
  ) as tile;

  RETURN mvt;
END
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;

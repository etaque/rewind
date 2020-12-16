

/******************************************************************************
https://github.com/mapbox/postgis-vt-util/blob/master/src/TileBBox.sql

### TileBBox ###
Given a Web Mercator tile ID as (z, x, y), returns a bounding-box
geometry of the area covered by that tile.
__Parameters:__
- `integer` z - A tile zoom level.
- `integer` x - A tile x-position.
- `integer` y - A tile y-position.
- `integer` srid - SRID of the desired target projection of the bounding
  box. Defaults to 3857 (Web Mercator).
__Returns:__ `geometry(polygon)`
******************************************************************************/
create or replace function TileBBox (z int, x int, y int, srid int = 3857)
    returns geometry
    language plpgsql immutable as
$func$
declare
    max numeric := 20037508.34;
    res numeric := (max*2)/(2^z);
    bbox geometry;
begin
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
end;
$func$;


CREATE OR REPLACE FUNCTION public.wind_tiles(z integer, x integer, y integer, query_params json) RETURNS bytea AS $$
DECLARE
  mvt bytea;
BEGIN
  SELECT INTO mvt ST_AsMVT(tile, 'wind', 4096, 'geom') FROM (
    SELECT
      ST_AsMVTGeom(ST_Transform(point, 3857), TileBBox(z, x, y, 3857), 4096, 64, true) AS geom,
      u,
      v
    FROM public.wind_points
    WHERE point && TileBBox(z, x, y, 4326)
    AND wind_report_id = (query_params->>'wind_report_id')::int
  ) as tile WHERE geom IS NOT NULL;

  RETURN mvt;
END
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;

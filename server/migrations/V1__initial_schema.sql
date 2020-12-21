CREATE TABLE wind_rasters (
  id UUID PRIMARY KEY,
  rast raster
);

CREATE INDEX ON wind_rasters USING gist (st_convexhull("rast"));

create table wind_reports (
  id UUID primary key,
  raster_id UUID references wind_rasters(id),
  url text not null,
  day date not null,
  hour smallint not null,
  forecast smallint not null,
  target_time timestamptz not null default now(),
  creation_time timestamptz not null default now()
);

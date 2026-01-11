-- Drop the old raster-based schema and create new simplified schema
-- Wind rasters are now stored in S3 as PNG files

-- Drop old tables
DROP TABLE IF EXISTS wind_reports;
DROP TABLE IF EXISTS wind_rasters;

-- Recreate wind_reports without raster reference
CREATE TABLE wind_reports (
  id UUID PRIMARY KEY,
  url TEXT NOT NULL,
  png_path TEXT NOT NULL,
  day DATE NOT NULL,
  hour SMALLINT NOT NULL,
  forecast SMALLINT NOT NULL,
  target_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  creation_time TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON wind_reports (day, hour, forecast);

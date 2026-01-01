-- Enable required PostGIS extensions
CREATE EXTENSION IF NOT EXISTS hstore;
CREATE EXTENSION IF NOT EXISTS postgis_raster;

-- Enable all GDAL drivers for raster operations
ALTER DATABASE rewind SET postgis.gdal_enabled_drivers TO 'ENABLE_ALL';
SELECT pg_reload_conf();

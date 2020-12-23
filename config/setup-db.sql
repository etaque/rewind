-- @see docker-compose.yml

ALTER DATABASE rewind SET postgis.gdal_enabled_drivers TO 'ENABLE_ALL';
SELECT pg_reload_conf();

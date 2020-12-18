create index wind_points_wind_report_id_idx 
  on wind_points (wind_report_id);

create index wind_points_point_idx
  on wind_points
  using GIST (point);


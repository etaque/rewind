create table wind_reports (
  id bigserial primary key,
  url text not null,
  day date not null,
  hour smallint not null,
  forecast smallint not null,
  creation timestamptz not null default now()
);

create table wind_points (
  id bigserial primary key,
  wind_report_id bigint not null references wind_reports(id),
  point geometry(Point) not null,
  u float not null,
  v float not null
);

create table wind_records (
  id serial primary key,
  url text not null,
  day date not null,
  hour smallint not null,
  creation timestamptz not null default now()
);

create table wind_points (
  id serial primary key,
  wind_record_id int not null references wind_records(id),
  point geometry not null,
  u float not null,
  v float not null
);

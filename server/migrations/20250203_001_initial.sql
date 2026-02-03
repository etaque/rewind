-- wind_reports table
CREATE TABLE IF NOT EXISTS wind_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time INTEGER NOT NULL UNIQUE,
    grib_path TEXT NOT NULL,
    png_path TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'ncar',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_wind_reports_time ON wind_reports(time);

-- courses table
CREATE TABLE IF NOT EXISTS courses (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- race_results table
CREATE TABLE IF NOT EXISTS race_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_key TEXT NOT NULL,
    player_name TEXT NOT NULL,
    player_id TEXT,
    finish_time INTEGER NOT NULL,
    race_start_time INTEGER NOT NULL,
    path_s3_key TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    UNIQUE(course_key, player_name, race_start_time)
);
CREATE INDEX IF NOT EXISTS idx_leaderboard ON race_results(course_key, finish_time);

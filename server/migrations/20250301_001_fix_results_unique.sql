-- Replace the uniqueness constraint on race_results to use player_id
-- instead of player_name, preventing the same player from having
-- duplicate results while allowing different players with the same name.

-- SQLite requires table recreation to change inline UNIQUE constraints.
CREATE TABLE race_results_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_key TEXT NOT NULL,
    player_name TEXT NOT NULL,
    player_id TEXT,
    finish_time INTEGER NOT NULL,
    race_start_time INTEGER NOT NULL,
    path_s3_key TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    UNIQUE(course_key, player_id, race_start_time)
);

INSERT INTO race_results_new (id, course_key, player_name, player_id, finish_time, race_start_time, path_s3_key, created_at)
    SELECT id, course_key, player_name, player_id, finish_time, race_start_time, path_s3_key, created_at
    FROM race_results;

DROP TABLE race_results;
ALTER TABLE race_results_new RENAME TO race_results;

CREATE INDEX IF NOT EXISTS idx_leaderboard ON race_results(course_key, finish_time);

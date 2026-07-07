CREATE TABLE IF NOT EXISTS users (
  token       TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS days (
  token          TEXT NOT NULL REFERENCES users(token),
  day            TEXT NOT NULL,             -- 'YYYY-MM-DD' (UTC)
  input          INTEGER NOT NULL DEFAULT 0,
  output         INTEGER NOT NULL DEFAULT 0,
  cache_read     INTEGER NOT NULL DEFAULT 0,
  cache_creation INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (token, day)
);

CREATE INDEX IF NOT EXISTS idx_days_day ON days(day);

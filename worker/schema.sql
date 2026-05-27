CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT DEFAULT '',
  bvid TEXT,
  r2_key TEXT NOT NULL UNIQUE,
  duration REAL,
  file_size INTEGER,
  date_added TEXT DEFAULT (datetime('now')),
  source TEXT DEFAULT 'bili'
);

CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
CREATE INDEX IF NOT EXISTS idx_tracks_bvid ON tracks(bvid);
CREATE INDEX IF NOT EXISTS idx_tracks_author ON tracks(author);

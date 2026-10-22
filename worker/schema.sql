CREATE TABLE IF NOT EXISTS reviews (
 clip_id TEXT NOT NULL,
 reviewer_id TEXT NOT NULL,
 name TEXT NOT NULL,
 choice TEXT NOT NULL CHECK (choice IN ('include','maybe','skip')),
 note TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL,
 PRIMARY KEY (clip_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer_id);

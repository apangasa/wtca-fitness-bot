// Inlined so tsc output needs no asset copying.
export const SCHEMA = /* sql */ `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  -- Assigned once, in join order, never reused. Chart color follows the person,
  -- not their current rank, so a leaderboard reshuffle never repaints the bars.
  color_slot    INTEGER NOT NULL,
  first_seen    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercises (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  unit        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  -- Display price per rep, derived from the pricing record. Points are not stored on an entry:
  -- they are worked out from the record, so a pricing change reprices history (docs/points.md).
  points_per_rep REAL NOT NULL DEFAULT 0,
  -- Weighted exercises only (NULL = a plain counted exercise): a reference weight marks the exercise as weighted,
  -- and weight_mode says how the logged weight becomes the effective one (docs/points-lifts.md).
  -- Rows without a pricing record score from points_per_rep x effective weight / ref_weight.
  ref_weight     REAL,
  weight_mode    TEXT NOT NULL DEFAULT 'load',
  weight_note    TEXT,
  -- 1 while an exercise someone logged with /new is waiting to be priced. It scores 0, gets
  -- no slash command, and weight_note holds the notes people left. See db/queries.ts.
  pending        INTEGER NOT NULL DEFAULT 0,
  -- JSON pricing record (flat, lift or bodyweight; see scoring.ts). Points come from this, through the
  -- entry_points() SQL function; NULL scores from points_per_rep / ref_weight / weight_mode (see above).
  pricing        TEXT
);

-- Optional body weight (/weight). Absent = 150 lb.
-- The log is append-only (weight_lb NULL = cleared). See db/index.ts migration 5.
CREATE TABLE IF NOT EXISTS user_weight (
  user_id    TEXT PRIMARY KEY,
  weight_lb  REAL NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_weight_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  weight_lb  REAL,
  set_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users(id),
  exercise_key  TEXT NOT NULL REFERENCES exercises(key),
  day_key       TEXT NOT NULL,
  amount        REAL NOT NULL,
  created_at    TEXT NOT NULL,
  -- Logged weight in lb for a weighted lift; NULL when there was none, which
  -- scores at the reference weight (the exercise's plain base price).
  weight        REAL
);

CREATE INDEX IF NOT EXISTS idx_entries_day      ON entries(guild_id, day_key);
CREATE INDEX IF NOT EXISTS idx_entries_user_day ON entries(guild_id, user_id, day_key);
CREATE INDEX IF NOT EXISTS idx_entries_ex       ON entries(guild_id, exercise_key, day_key);

-- Seasons are date ranges. Generated from a rule (two calendar months each,
-- Season 1 excepted) but kept as rows so a boundary can be corrected by hand.
CREATE TABLE IF NOT EXISTS seasons (
  id         INTEGER PRIMARY KEY,
  label      TEXT NOT NULL,
  start_day  TEXT NOT NULL,
  end_day    TEXT NOT NULL
);

/*
 * The final board of a closed season, frozen at the moment it closed. Points live
 * on the exercise so history reprices - which is wanted for current standings and
 * NOT wanted for a trophy already awarded. Freezing the whole board, not just the
 * champion, is what stops the hall of fame and the season leaderboard disagreeing.
 */
CREATE TABLE IF NOT EXISTS season_standings (
  season_id     INTEGER NOT NULL REFERENCES seasons(id),
  guild_id      TEXT NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users(id),
  display_name  TEXT NOT NULL,
  color_slot    INTEGER NOT NULL,
  points        REAL NOT NULL,
  reps          REAL NOT NULL,
  days          INTEGER NOT NULL,
  frozen_at     TEXT NOT NULL,
  PRIMARY KEY (season_id, guild_id, user_id)
);

/*
 * Everything said in the fitness channel, kept so feedback can be read back and acted on.
 * Fed live by messages.ts and backfilled by scripts/backfill-messages.ts. A deleted message keeps
 * its row with deleted_at set; an edit overwrites content and sets edited_at.
 */
CREATE TABLE IF NOT EXISTS channel_messages (
  id           TEXT PRIMARY KEY,
  guild_id     TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  -- Set only for a message in a thread of the fitness channel: the thread's name.
  channel_name TEXT,
  author_id   TEXT NOT NULL,
  author_name  TEXT NOT NULL,
  is_bot       INTEGER NOT NULL DEFAULT 0,
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  edited_at    TEXT,
  deleted_at   TEXT,
  reply_to_id  TEXT,
  attachments  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_channel_messages_time ON channel_messages(guild_id, created_at);

CREATE TABLE IF NOT EXISTS guild_config (
  guild_id          TEXT PRIMARY KEY,
  recap_channel_id  TEXT,
  recap_time        TEXT,
  last_recap_day    TEXT,
  -- Fingerprint of the totals in the last recap we posted. A recap is re-posted
  -- only when the numbers actually changed, so a manual /recap followed by a
  -- quiet night does not produce a duplicate.
  last_recap_sig    TEXT,
  -- Highest season already announced as finished. Same idea as the recap
  -- fingerprint: the closing post fires once, and a bot that was down at the
  -- rollover posts it on the next run instead of skipping it forever.
  last_closed_season INTEGER
);
`;

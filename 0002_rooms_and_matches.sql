-- Additive migration: preserves question_bank and existing question content.
CREATE TABLE IF NOT EXISTS game_rooms (
  code TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK(mode IN ('single','phones')),
  status TEXT NOT NULL CHECK(status IN ('waiting','playing','finished')),
  revision INTEGER NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  winner TEXT CHECK(winner IN ('red','blue') OR winner IS NULL),
  current_phase TEXT,
  current_round INTEGER NOT NULL DEFAULT 0,
  current_turn TEXT CHECK(current_turn IN ('red','blue') OR current_turn IS NULL),
  deadline INTEGER,
  state_json TEXT NOT NULL CHECK(json_valid(state_json)),
  questions_snapshot_json TEXT NOT NULL CHECK(json_valid(questions_snapshot_json))
);
CREATE INDEX IF NOT EXISTS idx_game_rooms_expiry ON game_rooms(expires_at);
CREATE INDEX IF NOT EXISTS idx_game_rooms_status ON game_rooms(status,updated_at);
CREATE TABLE IF NOT EXISTS room_teams (
  room_code TEXT NOT NULL REFERENCES game_rooms(code) ON DELETE CASCADE,
  team TEXT NOT NULL CHECK(team IN ('red','blue')),
  name TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  double_used INTEGER NOT NULL DEFAULT 0 CHECK(double_used IN (0,1)),
  inventory_json TEXT NOT NULL CHECK(json_valid(inventory_json)),
  PRIMARY KEY(room_code,team)
);
CREATE TABLE IF NOT EXISTS room_sessions (
  room_code TEXT NOT NULL REFERENCES game_rooms(code) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('host','red','blue')),
  credential_hash TEXT NOT NULL,
  PRIMARY KEY(room_code,role)
);
CREATE TABLE IF NOT EXISTS room_score_audit (
  room_code TEXT NOT NULL REFERENCES game_rooms(code) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  round INTEGER NOT NULL,
  team TEXT NOT NULL CHECK(team IN ('red','blue')),
  delta INTEGER NOT NULL,
  score_before INTEGER NOT NULL,
  score_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY(room_code,sequence)
);
CREATE TABLE IF NOT EXISTS room_events (
  room_code TEXT NOT NULL REFERENCES game_rooms(code) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  phase TEXT,
  round INTEGER NOT NULL,
  occurred_at INTEGER NOT NULL,
  PRIMARY KEY(room_code,revision)
);

CREATE TABLE IF NOT EXISTS room_members (
 room_code TEXT NOT NULL REFERENCES game_rooms(code) ON DELETE CASCADE,
 member_id TEXT NOT NULL,
 name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('red','blue','viewer')),
 credential_hash TEXT NOT NULL,
 PRIMARY KEY(room_code,member_id)
);
CREATE INDEX IF NOT EXISTS idx_room_members_role ON room_members(room_code,role);

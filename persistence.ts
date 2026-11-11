import type { GameState, Question } from "../src/engine";
import type { Mode } from "../src/protocol";
export interface RoomEvent {
  revision: number;
  type: string;
  phase: string | null;
  round: number;
  at: number;
}
export interface RoomRecord {
  schemaVersion: 2;
  categoryIds: string[];
  members?: {
    id: string;
    name: string;
    key: string;
    role: "red" | "blue" | "viewer";
  }[];
  code: string;
  mode: Mode;
  names: [string, string];
  keys: { host: string; red: string; blue: string };
  questions: Question[];
  game: GameState | null;
  revision: number;
  paused: boolean;
  expires: number;
  createdAt?: number;
  events?: RoomEvent[];
}
export async function saveRoomToD1(
  db: D1Database,
  s: RoomRecord,
): Promise<void> {
  const now = Date.now();
  const game = s.game;
  const statements: D1PreparedStatement[] = [];
  statements.push(
    db
      .prepare(
        `INSERT INTO game_rooms(code,mode,status,revision,paused,created_at,updated_at,expires_at,winner,current_phase,current_round,current_turn,deadline,state_json,questions_snapshot_json,schema_version,category_ids_json)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET status=excluded.status,revision=excluded.revision,paused=excluded.paused,updated_at=excluded.updated_at,expires_at=excluded.expires_at,winner=excluded.winner,current_phase=excluded.current_phase,current_round=excluded.current_round,current_turn=excluded.current_turn,deadline=excluded.deadline,state_json=excluded.state_json,schema_version=excluded.schema_version,category_ids_json=excluded.category_ids_json WHERE excluded.revision>=game_rooms.revision`,
      )
      .bind(
        s.code,
        s.mode,
        !game ? "waiting" : game.phase === "FINISHED" ? "finished" : "playing",
        s.revision,
        Number(s.paused),
        s.createdAt ?? now,
        now,
        s.expires,
        game?.winner ?? null,
        game?.phase ?? null,
        game?.round ?? 0,
        game?.turn ?? null,
        game?.deadline ?? null,
        JSON.stringify(game),
        JSON.stringify(s.questions),
        s.schemaVersion,
        JSON.stringify(s.categoryIds),
      ),
  );
  for (const [index, team] of (["red", "blue"] as const).entries()) {
    const t = game?.teams[team];
    statements.push(
      db
        .prepare(
          `INSERT INTO room_teams(room_code,team,name,score,double_used,inventory_json) VALUES(?,?,?,?,?,?) ON CONFLICT(room_code,team) DO UPDATE SET name=excluded.name,score=excluded.score,double_used=excluded.double_used,inventory_json=excluded.inventory_json`,
        )
        .bind(
          s.code,
          team,
          t?.name ?? s.names[index],
          t?.score ?? 0,
          Number(t?.doubleUsed ?? false),
          JSON.stringify(t?.inventory ?? ["FREEZE", "SWAP", "FIFTY_FIFTY"]),
        ),
    );
  }
  const memberRows = await Promise.all(
    (s.members ?? []).map(async (m) => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(m.key),
      );
      return {
        id: m.id,
        name: m.name,
        role: m.role,
        hash: Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      };
    }),
  );
  statements.push(
    db
      .prepare(
        `INSERT INTO room_members(room_code,member_id,name,role,credential_hash)
    SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.role'),json_extract(value,'$.hash') FROM json_each(?) WHERE 1
    ON CONFLICT(room_code,member_id) DO UPDATE SET name=excluded.name,role=excluded.role,credential_hash=excluded.credential_hash`,
      )
      .bind(s.code, JSON.stringify(memberRows)),
  );
  const hostBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s.keys.host),
  );
  const credentials = [
    {
      role: "host",
      hash: Array.from(new Uint8Array(hostBytes), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
    },
    ...memberRows
      .filter((m) => m.role !== "viewer")
      .map((m) => ({ role: m.role, hash: m.hash })),
  ];
  statements.push(
    db.prepare("DELETE FROM room_sessions WHERE room_code=?").bind(s.code),
  );
  statements.push(
    db
      .prepare(
        `INSERT INTO room_sessions(room_code,role,credential_hash) SELECT ?,json_extract(value,'$.role'),json_extract(value,'$.hash') FROM json_each(?)`,
      )
      .bind(s.code, JSON.stringify(credentials)),
  );
  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO room_score_audit(room_code,sequence,round,team,delta,score_before,score_after,reason)
 SELECT ?,CAST(key AS INTEGER),json_extract(value,'$.round'),json_extract(value,'$.team'),json_extract(value,'$.delta'),json_extract(value,'$.before'),json_extract(value,'$.after'),json_extract(value,'$.reason') FROM json_each(?)`,
      )
      .bind(s.code, JSON.stringify(game?.audit ?? [])),
  );
  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO room_events(room_code,revision,event_type,phase,round,occurred_at)
 SELECT ?,json_extract(value,'$.revision'),json_extract(value,'$.type'),json_extract(value,'$.phase'),json_extract(value,'$.round'),json_extract(value,'$.at') FROM json_each(?)`,
      )
      .bind(s.code, JSON.stringify(s.events ?? [])),
  );
  // Eight statements per sync, independent of the number of rounds or events.
  // A single D1 batch commits the snapshot and its audit transactionally.
  await db.batch(statements);
}
export async function removeRoomFromD1(
  db: D1Database,
  code: string,
): Promise<void> {
  await db.prepare("DELETE FROM game_rooms WHERE code=?").bind(code).run();
}

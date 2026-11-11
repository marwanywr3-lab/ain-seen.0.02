import { readFile, writeFile } from "node:fs/promises";
const data = JSON.parse(await readFile("src/data.json", "utf8"));
const questions = data.categories.flatMap((c) => c.questions);
const payload = JSON.stringify({ schemaVersion: 2, questions, disabled: [] });
// D1 caps individual SQL statement length. Stage bounded UTF-8-safe chunks,
// then replace the public bank only after every chunk is present.
const chars = Array.from(payload),
  chunks = [];
for (let i = 0; i < chars.length; i += 4000)
  chunks.push(chars.slice(i, i + 4000).join(""));
const stage =
  `CREATE TABLE IF NOT EXISTS question_bank_import_chunks(sequence INTEGER PRIMARY KEY,data TEXT NOT NULL);\nDELETE FROM question_bank_import_chunks;\n` +
  chunks
    .map(
      (s, i) =>
        `INSERT INTO question_bank_import_chunks VALUES(${i},'${s.replaceAll("'", "''")}');\n`,
    )
    .join("") +
  `UPDATE question_bank SET payload=(SELECT group_concat(data,'') FROM (SELECT data FROM question_bank_import_chunks ORDER BY sequence)),revision=revision+1 WHERE id=1;\nDROP TABLE question_bank_import_chunks;\n`;
await writeFile(
  "migrations/0001_questions.sql",
  `CREATE TABLE IF NOT EXISTS question_bank (id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);\nINSERT OR IGNORE INTO question_bank VALUES(1,'{"schemaVersion":2,"questions":[],"disabled":[]}',0);\n` +
    stage,
);
await writeFile(
  "migrations/0004_catalog_v2.sql",
  `-- Preserve the previous bank privately for the requested rollback path.\nCREATE TABLE IF NOT EXISTS question_bank_versions(version TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL,saved_at TEXT NOT NULL);\nINSERT OR IGNORE INTO question_bank_versions SELECT 'pre-catalog-v2',payload,revision,datetime('now') FROM question_bank WHERE id=1;\n` +
    stage +
    `ALTER TABLE game_rooms ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;\nALTER TABLE game_rooms ADD COLUMN category_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(category_ids_json));\n-- Previous room snapshots are retained for rollback but cannot run v2 rules.\nUPDATE game_rooms SET status='finished',deadline=NULL WHERE schema_version=1;\n`,
);

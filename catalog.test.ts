import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseQuestions, createGame } from "../src/engine.ts";
import { categories, selection } from "../src/catalog.ts";
const read = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const data = read("../src/data.json");
const source = read("../content/source-questions.json");
const questions = parseQuestions(
  data.categories.flatMap((c: { questions: unknown[] }) => c.questions),
);
test("all 480 source texts and answers are preserved; all 30 categories have usable tier pools and mapped PNGs", () => {
  assert.equal(categories.length, 30);
  assert.equal(questions.length, 480);
  for (const q of questions) {
    assert.equal(q.question, source[q.sourceIndex!]["السؤال"]);
    assert.equal(q.answer, source[q.sourceIndex!]["الاجابة"]);
    assert.equal(q.sourcePoints, source[q.sourceIndex!]["الصعوبة"]);
    assert.equal(q.options.filter((o) => o === q.answer).length, 1);
  }
  for (const c of categories) {
    assert.ok(
      readFileSync(new URL("../public/" + c.icon, import.meta.url))
        .subarray(1, 4)
        .equals(Buffer.from("PNG")),
    );
    for (const tier of [200, 400, 600])
      assert.ok(
        questions.filter((q) => q.categoryId === c.id && q.points === tier)
          .length >= 3,
      );
  }
});
test("selection rejects duplicates, five/seven categories and unknown category IDs", () => {
  const ids = categories.slice(0, 6).map((c) => c.id);
  assert.deepEqual(selection(ids), ids);
  for (const input of [
    ids.slice(1),
    [...ids, "c07"],
    ["c01", ...ids.slice(0, 5)],
    ["invalid", ...ids.slice(1)],
  ])
    assert.throws(() => selection(input));
});
test("all categories can form an eighteen-cell match with exactly one of each tier per selected category", () => {
  for (let offset = 0; offset < 30; offset++) {
    const ids = Array.from(
      { length: 6 },
      (_, i) => categories[(i + offset) % 30]!.id,
    );
    const game = createGame(questions, ["أ", "ب"], offset, ids);
    assert.equal(game.cells.length, 18);
    for (const id of ids)
      assert.deepEqual(
        game.cells.filter((c) => c.categoryId === id).map((c) => c.points),
        [200, 400, 600],
      );
  }
});

test("catalog migration archives the prior bank and rollback restores it without dropping room data", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { sqlStatements } = await import("../scripts/sql-statements.mjs");
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE question_bank(id INTEGER PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL);",
  );
  const prior = JSON.stringify({
    questions: [{ id: 1, question: "بيانات قبل الترقية" }],
    disabled: [],
  });
  db.prepare("INSERT INTO question_bank VALUES(1,?,7)").run(prior);
  for (const file of [
    "0002_rooms_and_matches.sql",
    "0003_room_members.sql",
    "0004_catalog_v2.sql",
  ]) {
    const sql = readFileSync(
      new URL("../migrations/" + file, import.meta.url),
      "utf8",
    );
    for (const statement of sqlStatements(sql)) {
      assert.ok(Buffer.byteLength(statement) < 100000);
      db.exec(statement);
    }
  }
  const current = JSON.parse(
    db.prepare("SELECT payload FROM question_bank WHERE id=1").get()!
      .payload as string,
  );
  assert.equal(current.schemaVersion, 2);
  assert.equal(current.questions.length, 480);
  assert.equal(
    db
      .prepare(
        "SELECT payload FROM question_bank_versions WHERE version='pre-catalog-v2'",
      )
      .get()!.payload,
    prior,
  );
  db.exec(
    readFileSync(
      new URL("../scripts/rollback-catalog.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    db.prepare("SELECT payload FROM question_bank WHERE id=1").get()!.payload,
    prior,
  );
  assert.equal(
    JSON.parse(
      db
        .prepare(
          "SELECT payload FROM question_bank_versions WHERE version='catalog-v2-before-rollback'",
        )
        .get()!.payload as string,
    ).questions.length,
    480,
  );
  assert.ok(
    db.prepare("SELECT name FROM sqlite_master WHERE name='game_rooms'").get(),
  );
  db.close();
});

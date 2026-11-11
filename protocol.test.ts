import { test } from "node:test";
import assert from "node:assert/strict";
import { allowed, project, validCommand } from "../src/protocol.ts";
import { createGame, parseQuestions, transition } from "../src/engine.ts";
import { readFileSync } from "node:fs";
const q = parseQuestions(
  JSON.parse(
    readFileSync(new URL("../src/questions.json", import.meta.url), "utf8"),
  ),
);
test("only host can configure valid turn durations", () => {
  for (const seconds of [20, 65, 120]) {
    const command = { type: "SET_TURN_SECONDS", seconds } as const;
    assert.equal(validCommand(command), true);
    assert.equal(allowed("host", "phones", command), true);
    for (const role of ["red", "blue", "viewer"] as const)
      assert.equal(allowed(role, "phones", command), false);
  }
  for (const seconds of [19, 121, 30.5, "60", null])
    assert.equal(validCommand({ type: "SET_TURN_SECONDS", seconds }), false);
});
test("captains cannot act for rivals or control host transitions", () => {
  assert.equal(
    allowed("red", "phones", { type: "SUBMIT_ANSWER", team: "blue", index: 0 }),
    false,
  );
  assert.equal(allowed("red", "phones", { type: "REVEAL_QUESTION" }), false);
  assert.equal(
    allowed("host", "phones", { type: "SUBMIT_ANSWER", team: "red", index: 0 }),
    false,
  );
  assert.equal(
    allowed("host", "single", { type: "BUZZ_SUDDEN", team: "blue" }),
    true,
  );
  assert.equal(allowed("viewer", "single", { type: "START" }), false);
});
test("projection never leaks bank, fallback, seed or unrevealed answers", () => {
  let s = createGame(q, ["a", "b"], 1);
  let p = project(s, "viewer")!;
  assert.equal("sudden" in p, false);
  assert.equal("seed" in p, false);
  assert.equal("question" in p.cells[0]!, false);
  s = transition(
    s,
    { type: "SELECT_CELL", team: s.turn, cellId: s.cells[0]!.id },
    0,
  );
  assert.equal(project(s, "viewer")!.current, null);
  assert.ok(project(s, "host")!.current?.answer);
  s = transition(s, { type: "REVEAL_QUESTION" }, 0);
  p = project(s, "red")!;
  assert.equal("answer" in p.current!, false);
  assert.equal("hint" in p.current!, false);
});
test("wire validation rejects timer injection and invalid team/index/card", () => {
  assert.equal(validCommand({ type: "EXPIRE_TIMER", timerId: 1 }), false);
  assert.equal(
    validCommand({ type: "SUBMIT_ANSWER", team: "host", index: 0 }),
    false,
  );
  assert.equal(
    validCommand({ type: "SUBMIT_ANSWER", team: "red", index: 9 }),
    false,
  );
  assert.equal(
    validCommand({ type: "USE_JOKER", team: "red", card: "FAKE" }),
    false,
  );
});
test("host player controls own team only and never sees unrevealed answers", () => {
  assert.equal(
    allowed("host", "phones", { type: "BUZZ_STEAL", team: "red" }, "red"),
    true,
  );
  assert.equal(
    allowed(
      "host",
      "phones",
      { type: "SUBMIT_ANSWER", team: "blue", index: 0 },
      "red",
    ),
    false,
  );
  assert.equal(
    allowed("host", "phones", { type: "REVEAL_QUESTION" }, "red"),
    true,
  );
  assert.equal(
    allowed("red", "phones", { type: "SET_HOST_TEAM", team: "red" }),
    false,
  );
  assert.equal(validCommand({ type: "SET_HOST_TEAM", team: null }), true);
  assert.equal(validCommand({ type: "SET_HOST_TEAM", team: "viewer" }), false);
  let state = createGame(q, ["a", "b"], 1);
  state = transition(
    state,
    { type: "SELECT_CELL", team: state.turn, cellId: state.cells[0]!.id },
    0,
  );
  assert.equal(project(state, "host", "red")!.current, null);
  state = transition(state, { type: "REVEAL_QUESTION" }, 0);
  assert.equal(project(state, "host", "red")!.current?.answer, undefined);
  assert.equal(project(state, "host", "red")!.current?.hint, undefined);
});

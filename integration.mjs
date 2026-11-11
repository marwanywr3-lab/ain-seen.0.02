import assert from "node:assert/strict";
import { mf } from "../scripts/local-worker.mjs";
const base = "http://localhost";
async function request(path, { key, method = "GET", data } = {}) {
  const response = await mf.dispatchFetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  return { status: response.status, data: await response.json() };
}
async function connect(code, key = "") {
  const response = await mf.dispatchFetch(base + `/rooms/${code}/ws`, {
    headers: { Upgrade: "websocket" },
  });
  const ws = response.webSocket;
  ws.accept();
  const state = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("WebSocket timeout")), 5000);
    ws.addEventListener("message", (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "STATE") {
        clearTimeout(timer);
        resolve(d);
      }
    });
    ws.send(JSON.stringify({ type: "HELLO", key }));
  });
  return { ws, state };
}
const created = await request("/rooms", {
  method: "POST",
  data: { names: ["اختبار الأحمر", "اختبار الأزرق"], mode: "phones" },
});
assert.equal(created.status, 200);
const { code, keys } = created.data;
const sockets = [];
try {
  let host = (await request(`/rooms/${code}`, { key: keys.host })).data;
  const act = async (key, action, revision = host.revision) => {
    const r = await request(`/rooms/${code}`, {
      key,
      method: "POST",
      data: { action, revision, id: crypto.randomUUID() },
    });
    host = (await request(`/rooms/${code}`, { key: keys.host })).data;
    return r;
  };
  assert.equal((await act(keys.host, { type: "START" })).status, 409);
  assert.equal(code.length, 8);
  assert.deepEqual(Object.keys(keys), ["host"]);
  const joined = {};
  for (const [team, name] of [
    ["red", "سالم"],
    ["blue", "فهد"],
    ["guest", "مروان"],
  ]) {
    const res = await request(`/rooms/${code}/join`, {
      method: "POST",
      data: { name },
    });
    assert.equal(res.status, 200);
    joined[team] = res.data;
    keys[team] = res.data.key;
  }
  for (const key of [keys.host, keys.red, keys.blue, keys.guest, ""]) {
    const c = await connect(code, key);
    sockets.push(c.ws);
  }
  host = (await request(`/rooms/${code}`, { key: keys.host })).data;
  assert.equal((await act(keys.red, { type: "START" })).status, 403);
  assert.equal((await act(keys.host, { type: "START" })).status, 409);
  assert.equal(
    (
      await act(keys.red, {
        type: "ASSIGN_CAPTAIN",
        team: "red",
        memberId: joined.red.memberId,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await act(keys.host, {
        type: "ASSIGN_CAPTAIN",
        team: "red",
        memberId: joined.red.memberId,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await act(keys.host, {
        type: "ASSIGN_CAPTAIN",
        team: "blue",
        memberId: joined.blue.memberId,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`/rooms/${code}`, { key: keys.red })).data.role,
    "red",
  );
  assert.equal(
    (
      await act(keys.host, {
        type: "ASSIGN_CAPTAIN",
        team: "red",
        memberId: joined.guest.memberId,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`/rooms/${code}`, { key: keys.red })).data.role,
    "viewer",
  );
  assert.equal(
    (
      await act(keys.host, {
        type: "ASSIGN_CAPTAIN",
        team: "red",
        memberId: joined.red.memberId,
      })
    ).status,
    200,
  );
  const ids = ["c13", "c14", "c15", "c16", "c17", "c18"];
  assert.equal(
    (await act(keys.red, { type: "SET_CATEGORIES", categoryIds: ids })).status,
    403,
  );
  assert.equal(
    (await act(keys.host, { type: "SET_CATEGORIES", categoryIds: ids })).status,
    200,
  );
  assert.deepEqual(host.categoryIds, ids);
  assert.equal(
    (await act(keys.red, { type: "SET_TURN_SECONDS", seconds: 120 })).status,
    403,
  );
  assert.equal(
    (await act(keys.host, { type: "SET_TURN_SECONDS", seconds: 121 })).status,
    403,
  );
  assert.equal(
    (await act(keys.host, { type: "SET_TURN_SECONDS", seconds: 120 })).status,
    200,
  );
  assert.equal((await request(`/rooms/${code}`)).data.turnSeconds, 120);
  assert.equal((await act(keys.host, { type: "START" })).status, 200);
  assert.equal(host.game.turnSeconds, 120);
  assert.equal(
    (await act(keys.host, { type: "SET_TURN_SECONDS", seconds: 20 })).status,
    409,
  );
  assert.equal(host.game.cells.length, 18);
  assert.equal(
    (await act(keys.host, { type: "SET_CATEGORIES", categoryIds: ids })).status,
    409,
  );
  const team = host.game.turn;
  const rival = team === "red" ? "blue" : "red";
  assert.equal(
    (
      await act("", {
        type: "SELECT_CELL",
        team,
        cellId: host.game.cells[0].id,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await act(keys[team], {
        type: "SELECT_CELL",
        team,
        cellId: host.game.cells[0].id,
      })
    ).status,
    200,
  );
  const spectator = (await request(`/rooms/${code}`)).data;
  assert.equal(spectator.game.current, null);
  assert.equal("question" in spectator.game.cells[0], false);
  assert.equal(
    (await act(keys[team], { type: "TRIGGER_DOUBLE_DOWN", team })).status,
    200,
  );
  assert.equal((await act(keys.host, { type: "REVEAL_QUESTION" })).status, 200);
  assert.ok(host.game.deadline - host.serverTime > 118000);
  assert.ok(host.game.deadline - host.serverTime <= 120000);
  const view = (await request(`/rooms/${code}`, { key: keys[team] })).data;
  assert.equal("answer" in view.game.current, false);
  assert.equal("sudden" in view.game, false);
  const q = host.game.current;
  const correct = q.options.indexOf(q.answer);
  const wrong = (correct + 1) % 4;
  assert.equal(
    (await act(keys[rival], { type: "SUBMIT_ANSWER", team, index: correct }))
      .status,
    403,
  );
  assert.equal(
    (await act(keys[team], { type: "SUBMIT_ANSWER", team, index: wrong }))
      .status,
    200,
  );
  assert.equal(host.game.teams[team].score, -2 * q.points);
  const rev = host.revision;
  const id = crypto.randomUUID();
  const buzz = () =>
    request(`/rooms/${code}`, {
      key: keys[rival],
      method: "POST",
      data: { action: { type: "BUZZ_STEAL", team: rival }, revision: rev, id },
    });
  const results = await Promise.all([buzz(), buzz()]);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(host.game.phase, "STEAL_BUZZ");
  host = (await request(`/rooms/${code}`, { key: keys.host })).data;
  assert.equal(host.game.phase, "STEAL_ANSWER");
  assert.equal(host.revision, rev + 1);
  assert.equal(
    (
      await act(keys[rival], {
        type: "SUBMIT_ANSWER",
        team: rival,
        index: correct,
      })
    ).status,
    200,
  );
  assert.equal(host.game.teams[rival].score, q.points);
  assert.equal((await act(keys.host, { type: "RESOLVE_ROUND" })).status, 200);
  assert.equal(host.game.turn, rival);
  assert.equal(
    (await act(keys.host, { type: "PAUSE", paused: true })).status,
    200,
  );
  assert.equal(
    (
      await act(keys[rival], {
        type: "SELECT_CELL",
        team: rival,
        cellId: host.game.cells[1].id,
      })
    ).status,
    409,
  );
  assert.equal(
    (await act(keys.host, { type: "PAUSE", paused: false })).status,
    200,
  );
  const nextCell = host.game.cells.find((c) => c.status === "available");
  assert.equal(
    (
      await act(keys[rival], {
        type: "SELECT_CELL",
        team: rival,
        cellId: nextCell.id,
      })
    ).status,
    200,
  );
  assert.equal((await act(keys.host, { type: "REVEAL_QUESTION" })).status, 200);
  assert.equal(
    (await act(keys[team], { type: "USE_JOKER", team, card: "FREEZE" })).status,
    200,
  );
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, host.game.deadline - Date.now()) + 300),
  );
  host = (await request(`/rooms/${code}`, { key: keys.host })).data;
  assert.equal(host.game.phase, "STEAL_BUZZ");
  const rejoined = await connect(code, keys[rival]);
  sockets.push(rejoined.ws);
  assert.equal(rejoined.state.role, rival);
  assert.equal(rejoined.state.game.phase, "STEAL_BUZZ");
  const admin = await request("/admin/bank", { key: "local-test-only" });
  assert.equal(admin.status, 200);
  assert.equal(admin.data.questions.length, 480);
  assert.equal((await request("/bank")).status, 200);
  const put = await request("/admin/bank", {
    key: "local-test-only",
    method: "PUT",
    data: admin.data,
  });
  assert.equal(put.status, 200);
  assert.equal(
    (
      await request("/admin/bank", {
        key: "local-test-only",
        method: "PUT",
        data: admin.data,
      })
    ).status,
    409,
  );
  const publicBank = await request("/bank");
  assert.equal(publicBank.status, 200);
  assert.equal(
    (await request("/bank", { method: "PUT", data: publicBank.data })).status,
    401,
  );
  const db = await mf.getD1Database("DB");
  const stored = await db
    .prepare("SELECT * FROM game_rooms WHERE code=?")
    .bind(code)
    .first();
  assert.ok(stored);
  assert.equal(stored.revision, host.revision);
  assert.equal(stored.current_phase, host.game.phase);
  assert.equal(
    JSON.parse(stored.state_json).teams[team].score,
    host.game.teams[team].score,
  );
  const teams = await db
    .prepare("SELECT * FROM room_teams WHERE room_code=?")
    .bind(code)
    .all();
  assert.equal(teams.results.length, 2);
  assert.ok(
    teams.results.every((t) => Array.isArray(JSON.parse(t.inventory_json))),
  );
  const audit = await db
    .prepare(
      "SELECT * FROM room_score_audit WHERE room_code=? ORDER BY sequence",
    )
    .bind(code)
    .all();
  assert.equal(audit.results.length, host.game.audit.length);
  const events = await db
    .prepare("SELECT event_type FROM room_events WHERE room_code=?")
    .bind(code)
    .all();
  assert.ok(events.results.some((e) => e.event_type === "CREATE_ROOM"));
  assert.ok(events.results.some((e) => e.event_type === "EXPIRE_TIMER"));
  assert.ok(events.results.some((e) => e.event_type === "SUBMIT_ANSWER"));
  const members = await db
    .prepare("SELECT * FROM room_members WHERE room_code=?")
    .bind(code)
    .all();
  assert.equal(members.results.length, 3);
  assert.ok(
    members.results.every(
      (m) =>
        m.credential_hash.length === 64 &&
        !Object.values(keys).includes(m.credential_hash),
    ),
  );
  const sessions = await db
    .prepare("SELECT * FROM room_sessions WHERE room_code=?")
    .bind(code)
    .all();
  assert.equal(sessions.results.length, 3);
  assert.ok(
    sessions.results.every(
      (s) =>
        s.credential_hash.length === 64 &&
        !Object.values(keys).includes(s.credential_hash),
    ),
  );
  {
    const dual = (
      await request("/rooms", {
        method: "POST",
        data: { names: ["مقدم لاعب", "منافس"], mode: "phones" },
      })
    ).data;
    const dualCode = dual.code,
      dualKey = dual.keys.host;
    const rival = (
      await request(`/rooms/${dualCode}/join`, {
        method: "POST",
        data: { name: "القائد المنافس" },
      })
    ).data;
    for (const key of [dualKey, rival.key])
      sockets.push((await connect(dualCode, key)).ws);
    const dualAction = async (key, action) => {
      const state = (await request(`/rooms/${dualCode}`, { key: dualKey }))
        .data;
      return request(`/rooms/${dualCode}`, {
        key,
        method: "POST",
        data: { action, revision: state.revision, id: crypto.randomUUID() },
      });
    };
    assert.equal(
      (await dualAction(rival.key, { type: "SET_HOST_TEAM", team: "red" }))
        .status,
      403,
    );
    assert.equal(
      (await dualAction(dualKey, { type: "SET_HOST_TEAM", team: "red" }))
        .status,
      200,
    );
    assert.equal(
      (
        await dualAction(dualKey, {
          type: "ASSIGN_CAPTAIN",
          team: "red",
          memberId: rival.memberId,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await dualAction(dualKey, {
          type: "ASSIGN_CAPTAIN",
          team: "blue",
          memberId: rival.memberId,
        })
      ).status,
      200,
    );
    let dualState = (await request(`/rooms/${dualCode}`, { key: dualKey }))
      .data;
    assert.equal(dualState.hostTeam, "red");
    assert.ok(dualState.presence.red && dualState.presence.blue);
    assert.equal((await dualAction(dualKey, { type: "START" })).status, 200);
    assert.equal(
      (await dualAction(dualKey, { type: "SET_HOST_TEAM", team: null })).status,
      409,
    );
    dualState = (await request(`/rooms/${dualCode}`, { key: dualKey })).data;
    const turn = dualState.game.turn;
    assert.equal(
      (
        await dualAction(turn === "red" ? dualKey : rival.key, {
          type: "SELECT_CELL",
          team: turn,
          cellId: dualState.game.cells[0].id,
        })
      ).status,
      200,
    );
    dualState = (await request(`/rooms/${dualCode}`, { key: dualKey })).data;
    assert.equal(dualState.game.current, null);
    assert.equal(
      (await dualAction(dualKey, { type: "REVEAL_QUESTION" })).status,
      200,
    );
    dualState = (await request(`/rooms/${dualCode}`, { key: dualKey })).data;
    assert.equal(dualState.game.current.answer, undefined);
    assert.equal(
      (
        await dualAction(dualKey, {
          type: "SUBMIT_ANSWER",
          team: "blue",
          index: 0,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await dualAction(turn === "red" ? dualKey : rival.key, {
          type: "SUBMIT_ANSWER",
          team: turn,
          index: 0,
        })
      ).status,
      200,
    );
    console.log(
      "PASS: host player assignment, captain exclusion, dual presence, match start, locked role, answer secrecy and team-only answer permissions",
    );
  }
  console.log(
    "PASS: real Worker/D1/DO/WebSocket integration, role enforcement, secret redaction, scoring, atomic duplicate buzzer, pause, actual timer alarm, reconnect, admin revision guard, and D1 storage plus code-based joining and host captain assignment",
  );
} finally {
  for (const ws of sockets) ws.close();
  await mf.dispose();
}

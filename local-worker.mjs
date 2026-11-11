import { sqlStatements } from "./sql-statements.mjs";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
export const mf = new Miniflare({
  host: "127.0.0.1",
  port: 8787,
  name: "ain-seen-api",
  modules: true,
  scriptPath: ".worker-build/index.js",
  compatibilityDate: "2026-11-01",
  durableObjects: { ROOMS: { className: "GameRoom", useSQLite: true } },
  d1Databases: ["DB"],
  ratelimits: {
    CREATE_LIMITER: {
      namespace_id: "1001",
      simple: { limit: 1000, period: 60 },
    },
  },
  bindings: {
    ALLOWED_ORIGINS: "http://terminal.local:4173,http://localhost:5173",
    ENVIRONMENT: "development",
    DEV_ADMIN_TOKEN: "local-test-only",
  },
});
await mf.ready;
const db = await mf.getD1Database("DB");
for (const file of [
  "0001_questions.sql",
  "0002_rooms_and_matches.sql",
  "0003_room_members.sql",
  "0004_catalog_v2.sql",
]) {
  for (const statement of sqlStatements(
    await readFile(`migrations/${file}`, "utf8"),
  ))
    await db.prepare(statement).run();
}
console.log(`Local Worker ready at ${await mf.ready}`);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await mf.dispose();
    process.exit(0);
  });

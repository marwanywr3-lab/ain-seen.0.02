import { deployedServiceUrl } from "./deployment-result.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const config = JSON.parse(
  (await readFile("wrangler.jsonc", "utf8")).replace(/,\s*([}\]])/g, "$1"),
);
config.account_id = process.env.CLOUDFLARE_ACCOUNT_ID || config.account_id;
config.d1_databases[0].database_id =
  process.env.D1_DATABASE_ID || config.d1_databases[0].database_id;
config.vars = {
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || config.vars.ALLOWED_ORIGINS,
};
if (!/^[a-f0-9]{32}$/.test(config.account_id || ""))
  throw Error("Invalid Cloudflare account ID");
if (!/^[a-f0-9-]{36}$/.test(config.d1_databases[0].database_id || ""))
  throw Error("Invalid D1 database ID");
if (!config.vars.ALLOWED_ORIGINS) throw Error("ALLOWED_ORIGINS is required");
await writeFile("wrangler.deploy.json", JSON.stringify(config, null, 2));
const run = (args) => {
  const result = spawnSync("npx", args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
};
run([
  "wrangler",
  "d1",
  "migrations",
  "apply",
  "ain-seen",
  "--remote",
  "--config",
  "wrangler.deploy.json",
]);
const deployed = spawnSync(
  "npx",
  ["wrangler", "deploy", "--config", "wrangler.deploy.json"],
  { encoding: "utf8", env: process.env },
);
process.stdout.write(deployed.stdout || "");
process.stderr.write(deployed.stderr || "");
if (deployed.status !== 0) process.exit(deployed.status || 1);
const apiUrl = deployedServiceUrl(
  (deployed.stdout || "") + "\n" + (deployed.stderr || ""),
  config.name,
);
const health = await fetch(`${apiUrl}/health`, {
  signal: AbortSignal.timeout(15000),
});
if (!health.ok || (await health.json()).ok !== true)
  throw Error("Published Worker health check failed");
const bankCheck = await fetch(`${apiUrl}/bank`, {
  signal: AbortSignal.timeout(15000),
});
const bankData = await bankCheck.json();
if (
  !bankCheck.ok ||
  !Array.isArray(bankData.questions) ||
  bankData.schemaVersion !== 2 ||
  bankData.questions.length !== 480 ||
  new Set(bankData.questions.map((q) => q.categoryId)).size !== 30 ||
  bankData.questions.some((q) => ![200, 400, 600].includes(q.points))
)
  throw Error("Published question database check failed");
await writeFile(
  "deployment-result.json",
  JSON.stringify({ apiUrl }, null, 2) + "\n",
);
await writeFile(
  "public/config.json",
  JSON.stringify({ apiUrl }, null, 2) + "\n",
);
console.log("Published service URL saved for frontend configuration.");

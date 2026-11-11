import { test } from "node:test";
import assert from "node:assert/strict";
import { deployedServiceUrl } from "../scripts/deployment-result.mjs";
test("deployment config uses observed Worker URL and rejects absent or wrong service", () => {
  assert.equal(
    deployedServiceUrl(
      "Deployed\nhttps://ain-seen-api.example.workers.dev",
      "ain-seen-api",
    ),
    "https://ain-seen-api.example.workers.dev",
  );
  assert.throws(() => deployedServiceUrl("Deployment failed", "ain-seen-api"));
  assert.throws(() =>
    deployedServiceUrl("https://another.example.workers.dev", "ain-seen-api"),
  );
});

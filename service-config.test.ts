import { test } from "node:test";
import assert from "node:assert/strict";
import { readServiceUrl } from "../src/service-config.ts";
test("only explicit HTTPS runtime endpoints are accepted", () => {
  assert.equal(
    readServiceUrl({ apiUrl: "https://example.workers.dev/" }),
    "https://example.workers.dev",
  );
  assert.equal(readServiceUrl({ apiUrl: "" }), "");
  for (const apiUrl of [
    "javascript:alert(1)",
    "http://example.com",
    "https://user:secret@example.com",
    "https://example.com/#secret",
  ])
    assert.throws(() => readServiceUrl({ apiUrl }));
});

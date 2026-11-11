import test from "node:test";
import assert from "node:assert/strict";
import { roomJoinUrl, readJoinCode } from "../src/room-links.ts";
test("QR join URL contains only room code, never host credentials", () => {
  const link = roomJoinUrl(
    "https://example.com/ain-seen/?secret=x#room=ABCDEF12&key=host-secret",
    "ABCDEF12",
  );
  assert.equal(link, "https://example.com/ain-seen/#join=ABCDEF12");
  assert.equal(readJoinCode(new URL(link).hash), "ABCDEF12");
  assert.equal(readJoinCode("#join=abcdef12"), "ABCDEF12");
  assert.equal(readJoinCode("#join=invalid"), "");
  assert.throws(() => roomJoinUrl(link, "invalid"));
});

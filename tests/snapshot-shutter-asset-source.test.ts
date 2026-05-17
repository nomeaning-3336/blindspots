import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import test from "node:test";

test("snapshot shutter sound is shipped as a normalized analyze sound asset", () => {
  const path = "public/analyze/sounds/shutter.wav";

  assert.equal(existsSync(path), true);
  assert.ok(statSync(path).size > 0);
});

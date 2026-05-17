import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("stockfish harness reuses a shared initialized process across requests", () => {
  const source = readFileSync("lib/engines/stockfish.ts", "utf8");

  assert.match(source, /let sharedEngineProcess:/);
  assert.match(source, /let sharedEngineInitPromise:/);
  assert.match(source, /let sharedEngineQueue: Promise<unknown> = Promise\.resolve\(\);/);
  assert.match(source, /async function getSharedStockfishProcess\(\)/);
  assert.match(source, /sharedEngineQueue = run\.then\(\(\) => undefined, \(\) => undefined\);/);
  assert.doesNotMatch(source, /const engine = createStockfishProcess\(\);\s*return \(async \(\) => \{/);
});

test("train opponent move route keeps a tight engine time budget", () => {
  const source = readFileSync("app/api/train/opponent-move/route.ts", "utf8");

  assert.match(source, /const TRAIN_ENGINE_TIME_LIMIT_MS = 1000;/);
  assert.match(source, /responseDelayMs: 0,/);
});

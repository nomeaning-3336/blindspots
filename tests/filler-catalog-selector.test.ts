import assert from "node:assert/strict";
import test from "node:test";
import {
  getDeterministicFillerCandidate,
  loadFillerCatalog,
  resetFillerCatalogCacheForTests,
} from "../lib/training/filler-catalog.ts";

test("filler catalog loads committed random-position entries", async () => {
  resetFillerCatalogCacheForTests();
  const catalog = await loadFillerCatalog();

  assert.ok(catalog.length > 100, "catalog must contain fallback positions");
  assert.equal(catalog[0]?.origin, "random_position");
});

test("deterministic filler selection returns the same candidate for the same cursor", async () => {
  const input = {
    userId: "user-stable-selection",
    seed: "seed-stable-selection",
    cursor: 12,
  };

  const first = await getDeterministicFillerCandidate(input);
  const second = await getDeterministicFillerCandidate(input);

  assert.ok(first, "first deterministic candidate must exist");
  assert.deepEqual(second, first, "same seed and cursor must return the same filler item");
});

test("deterministic filler traversal does not repeat within its first 100 cursor positions", async () => {
  const ids = new Set<string>();

  for (let cursor = 0; cursor < 100; cursor += 1) {
    const candidate = await getDeterministicFillerCandidate({
      userId: "user-no-repeat-window",
      seed: "seed-no-repeat-window",
      cursor,
    });

    assert.ok(candidate, `candidate must exist at cursor ${cursor}`);
    ids.add(candidate.id);
  }

  assert.equal(ids.size, 100, "the first 100 deterministic filler candidates must be unique");
});

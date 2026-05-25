import assert from "node:assert/strict";
import test from "node:test";
import {
  getDeterministicFillerCandidate,
  loadFillerCatalog,
  resetFillerCatalogCacheForTests,
} from "../lib/training/filler-catalog.ts";

test("filler catalog loads and interleaves both committed origins", async () => {
  resetFillerCatalogCacheForTests();
  const catalog = await loadFillerCatalog();

  assert.equal(catalog.length, 60000, "combined filler catalog must contain both 30000-item corpora");
  assert.equal(
    catalog.filter((item) => item.origin === "random_position").length,
    30000,
    "combined catalog must contain all random-position fillers",
  );
  assert.equal(
    catalog.filter((item) => item.origin === "lichess_puzzle").length,
    30000,
    "combined catalog must contain all Lichess-origin fillers",
  );

  assert.equal(catalog[0]?.origin, "random_position");
  assert.equal(catalog[1]?.origin, "lichess_puzzle");
  assert.equal(catalog[2]?.origin, "random_position");
  assert.equal(catalog[3]?.origin, "lichess_puzzle");
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

test("deterministic filler traversal alternates origins without repeats in its first 100 positions", async () => {
  const ids = new Set<string>();
  let previousOrigin: string | null = null;

  for (let cursor = 0; cursor < 100; cursor += 1) {
    const candidate = await getDeterministicFillerCandidate({
      userId: "user-no-repeat-window",
      seed: "seed-no-repeat-window",
      cursor,
    });

    assert.ok(candidate, `candidate must exist at cursor ${cursor}`);
    assert.ok(!ids.has(candidate.id), `candidate must not repeat at cursor ${cursor}`);

    if (previousOrigin !== null) {
      assert.notEqual(
        candidate.origin,
        previousOrigin,
        `candidate origin must alternate at cursor ${cursor}`,
      );
    }

    ids.add(candidate.id);
    previousOrigin = candidate.origin;
  }

  assert.equal(ids.size, 100, "the first 100 deterministic filler candidates must be unique");
});

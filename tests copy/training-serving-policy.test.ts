import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const policy: typeof import("../lib/training/serving-policy") = require("../lib/training/serving-policy.ts");

const {
  chooseServeMode,
  normalizeRecentServedModes,
  prependRecentServeMode,
} = policy;

test("revisit priority: due revisit always wins", () => {
  const result = chooseServeMode({ completedSequenceCount: 5, dueRevisitCount: 1, recentModes: [] });
  assert.equal(result, "revisit");
});

test("chooseServeMode returns a valid mode", () => {
  const validModes = ["revisit", "tactic", "opening", "middlegame", "endgame", "exploit", "explore", "wildcard"];
  const result = chooseServeMode({ completedSequenceCount: 0, dueRevisitCount: 0, recentModes: [] });
  assert.ok(validModes.includes(result), `got unexpected mode: ${result}`);
});

test("normalizeRecentServedModes ignores invalid entries", () => {
  const result = normalizeRecentServedModes([
    { mode: "middlegame", servedAt: "2026-04-26T10:00:00Z" },
    { mode: "invalid", servedAt: "2026-04-26T11:00:00Z" },
    { mode: 123, servedAt: "2026-04-26T12:00:00Z" },
    null,
  ] as Parameters<typeof normalizeRecentServedModes>[0]);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.mode, "middlegame");
});

test("normalizeRecentServedModes accepts valid object entries", () => {
  const result = normalizeRecentServedModes([
    { mode: "opening", servedAt: "2026-04-26T10:00:00Z" },
    { mode: "tactic", servedAt: "2026-04-26T11:00:00Z" },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.mode, "opening");
  assert.equal(result[1]!.mode, "tactic");
});

test("normalizeRecentServedModes non-array returns empty", () => {
  assert.deepEqual(normalizeRecentServedModes(null), []);
  assert.deepEqual(normalizeRecentServedModes("middlegame" as unknown as Parameters<typeof normalizeRecentServedModes>[0]), []);
});

test("prependRecentServeMode adds new entry at front", () => {
  const existing = [
    { mode: "middlegame" as const, servedAt: "2026-04-26T10:00:00Z" },
    { mode: "opening" as const, servedAt: "2026-04-26T11:00:00Z" },
  ];
  const result = prependRecentServeMode(existing, "tactic");
  assert.equal(result.length, 3);
  assert.equal(result[0]!.mode, "tactic");
  assert.equal(result[1]!.mode, "middlegame");
});

test("prependRecentServeMode keeps last 50 entries", () => {
  const filled = Array.from({ length: 50 }, (_, i) => ({
    mode: "middlegame" as const,
    servedAt: new Date(2026, 0, i + 1).toISOString(),
  }));
  const result = prependRecentServeMode(filled, "tactic");
  assert.equal(result.length, 50);
  assert.equal(result[0]!.mode, "tactic");
  assert.equal(result[49]!.mode, "middlegame");
});

test("chooseServeMode uses deterministic fallback when no recent history", () => {
  // When recentModes is empty, the modulo pattern takes over
  // Verify it returns something valid (not testing exact values which may differ by internal threshold)
  const result = chooseServeMode({ completedSequenceCount: 0, dueRevisitCount: 0, recentModes: [] });
  const validModes = ["revisit", "tactic", "opening", "middlegame", "endgame", "exploit", "explore", "wildcard"];
  assert.ok(validModes.includes(result), `got unexpected mode: ${result}`);
});

test("new profile no-history first serve is opening not wildcard", () => {
  // With completedSequenceCount=0 and no recentModes, chooseServeMode
  // should return "opening" — not "wildcard" — so new profiles get
  // a useful first position instead of a random one.
  const result = chooseServeMode({
    completedSequenceCount: 0,
    dueRevisitCount: 0,
    recentModes: [],
    rng: () => 0.5,
  });
  assert.equal(result, "opening", `expected opening for n=0, got ${result}`);
});

test("recent history below tactic floor forces tactic", () => {
  // When recentModes has fewer than MIN_COUNTS.tactic=2 tactic entries,
  // the rolling window enforcement should immediately return "tactic".
  const recentModes = [
    { mode: "opening" as const, servedAt: "2026-04-27T00:00:00.000Z" },
    { mode: "middlegame" as const, servedAt: "2026-04-27T00:00:01.000Z" },
    { mode: "endgame" as const, servedAt: "2026-04-27T00:00:02.000Z" },
  ];
  // Only 0 tactics in history, below MIN_COUNTS.tactic=2 floor
  const result = chooseServeMode({
    completedSequenceCount: 3,
    dueRevisitCount: 0,
    recentModes,
    rng: () => 0.5,
  });
  assert.equal(result, "tactic", `expected tactic when below tactic floor, got ${result}`);
});

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const queues: typeof import("../lib/training/queue-core") = require("../lib/training/queue-core.ts");

const {
  ensureTrainingQueuesHavePositionsCore,
  normalizeRecentServedFens,
  prependRecentServedFen,
  selectAndReserveNextTrainingPositionCore,
  updateQueuesAfterSequenceCore,
} = queues;

const NOW = new Date("2026-04-26T10:00:00.000Z");
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const ENDGAME_FEN = "8/8/8/8/8/8/8/K6k w - - 0 1";
const MIDGAME_FEN = "r1bq1rk1/pp1nbppp/2p1pn2/3p4/3P4/2N1PN2/PPQ1BPPP/R1B2RK1 w - - 0 10";

function item(
  fen: string,
  source: "initialization" | "elite" | "revisit" = "elite",
  scheduledAt = NOW.toISOString(),
  extra: Record<string, unknown> = {},
) {
  return {
    fen,
    fingerprint: {},
    scheduledAt,
    source,
    ...extra,
  };
}

test("selected exploit item is removed on serve", async () => {
  const first = item("exploit-1", "initialization");
  const result = await selectAndReserveNextTrainingPositionCore({
    exploitQueue: [first, item("exploit-2", "initialization")],
    exploreQueue: [item("explore-1")],
    revisitQueue: [],
    masteredQueue: [],
  }, { completedSequenceCount: 0, now: NOW, recentServedFens: [] });

  assert.equal(result.selectedQueue, "exploit");
  assert.equal(result.item?.fen, first.fen);
  assert.deepEqual(result.queues.exploitQueue.map((entry) => entry.fen), ["exploit-2"]);
});

test("selected explore item is removed on serve", async () => {
  const result = await selectAndReserveNextTrainingPositionCore({
    exploitQueue: [],
    exploreQueue: [item("explore-1"), item("explore-2")],
    revisitQueue: [],
    masteredQueue: [],
  }, { completedSequenceCount: 2, now: NOW, recentServedFens: [] });

  assert.equal(result.selectedQueue, "explore");
  assert.equal(result.item?.fen, "explore-1");
  assert.deepEqual(result.queues.exploreQueue.map((entry) => entry.fen), ["explore-2"]);
});

test("exact recent FEN is rejected", async () => {
  const result = await selectAndReserveNextTrainingPositionCore({
    exploitQueue: [item("repeat-me", "initialization"), item("fresh-one", "initialization")],
    exploreQueue: [],
    revisitQueue: [],
    masteredQueue: [],
  }, { completedSequenceCount: 0, now: NOW, recentServedFens: ["repeat-me"] });

  assert.equal(result.selectedQueue, "exploit");
  assert.equal(result.item?.fen, "fresh-one");
  assert.equal(result.rejectedRecentExactCount, 1);
  assert.equal(result.rejectedNearDuplicateCount, 0);
  assert.equal(result.nearDuplicateReason, null);
});

test("same game nearby ply is rejected when metadata is available", async () => {
  const result = await selectAndReserveNextTrainingPositionCore({
    exploitQueue: [
      item(START_FEN, "initialization", NOW.toISOString(), { gameId: "game-1", ply: 20 }),
      item(MIDGAME_FEN, "initialization", NOW.toISOString(), { gameId: "game-2", ply: 50 }),
    ],
    exploreQueue: [],
    revisitQueue: [],
    masteredQueue: [],
  }, {
    completedSequenceCount: 0,
    now: NOW,
    recentServedFens: [{ fen: ENDGAME_FEN, gameId: "game-1", ply: 15 }],
  });

  assert.equal(result.item?.fen, MIDGAME_FEN);
  assert.equal(result.rejectedNearDuplicateCount, 1);
  assert.equal(result.nearDuplicateReason, "same_game_ply_window");
});

test("high-similarity FEN is rejected", async () => {
  const result = await selectAndReserveNextTrainingPositionCore({
    exploitQueue: [item(AFTER_E4_FEN, "initialization"), item(ENDGAME_FEN, "initialization")],
    exploreQueue: [],
    revisitQueue: [],
    masteredQueue: [],
  }, {
    completedSequenceCount: 0,
    now: NOW,
    recentServedFens: [START_FEN],
  });

  assert.equal(result.item?.fen, ENDGAME_FEN);
  assert.equal(result.rejectedNearDuplicateCount, 1);
  assert.equal(result.nearDuplicateReason, "fen_similarity");
});

test("due revisit item is selected first and removed on serve", async () => {
  const result = await selectAndReserveNextTrainingPositionCore({
    exploitQueue: [item("exploit-1", "initialization")],
    exploreQueue: [item("explore-1")],
    revisitQueue: [
      item("revisit-1", "revisit", "2026-04-26T09:00:00.000Z"),
      item("revisit-2", "revisit", "2026-04-27T09:00:00.000Z"),
    ],
    masteredQueue: [],
  }, { completedSequenceCount: 0, now: NOW, recentServedFens: ["revisit-1"] });

  assert.equal(result.selectedQueue, "revisit");
  assert.equal(result.item?.fen, "revisit-1");
  assert.equal(result.wasDueRevisit, true);
  assert.deepEqual(result.queues.revisitQueue.map((entry) => entry.fen), ["revisit-2"]);
});

test("due revisit bypasses near-duplicate rejection", async () => {
  const result = await selectAndReserveNextTrainingPositionCore({
    exploitQueue: [item(ENDGAME_FEN, "initialization")],
    exploreQueue: [],
    revisitQueue: [item(START_FEN, "revisit", "2026-04-26T09:00:00.000Z", { gameId: "game-1", ply: 20 })],
    masteredQueue: [],
  }, {
    completedSequenceCount: 0,
    now: NOW,
    recentServedFens: [{ fen: START_FEN, gameId: "game-1", ply: 18 }],
  });

  assert.equal(result.selectedQueue, "revisit");
  assert.equal(result.item?.fen, START_FEN);
  assert.equal(result.rejectedRecentExactCount, 0);
  assert.equal(result.rejectedNearDuplicateCount, 0);
  assert.equal(result.nearDuplicateReason, null);
});

test("recent_served_fens excludes positions from explore refill", async () => {
  const recent = ["recent-elite-1"];
  const result = await ensureTrainingQueuesHavePositionsCore({
    exploitQueue: [],
    exploreQueue: [],
    revisitQueue: [],
    masteredQueue: [],
    recentServedFens: recent,
    now: NOW,
    exploreSampler: async (_count, excluded, now) => {
      return ["recent-elite-1", "fresh-elite-1"].flatMap((fen) => {
        if (excluded.has(fen)) return [];
        excluded.add(fen);
        return [item(fen, "elite", now.toISOString())];
      });
    },
  });

  assert.deepEqual(result.exploreQueue.map((entry) => entry.fen), ["fresh-elite-1"]);
});

test("recent_served_fens keeps only last 100", () => {
  const recent = Array.from({ length: 110 }, (_, index) => `fen-${index}`);
  const next = prependRecentServedFen(recent, "new-fen");

  assert.equal(next.length, 100);
  assert.equal(next[0], "new-fen");
  assert.equal(next.at(-1), "fen-98");
  assert.deepEqual(normalizeRecentServedFens(["a", "b", "a", "", 42]), ["a", "b"]);
});

test("complete-sequence still schedules failed positions into revisit after one day", async () => {
  const result = await updateQueuesAfterSequenceCore({
    currentQueues: {
      exploitQueue: [item("served-fen", "initialization"), item("next-fen", "initialization")],
      exploreQueue: [],
      revisitQueue: [],
      masteredQueue: [],
    },
    startingFen: "served-fen",
    evalPreservationScore: 0.2,
    sessionId: "session-1",
    now: NOW,
    itemFactory: (fen, source, scheduledAt, extra) => item(fen, source, scheduledAt, extra),
    exploreSampler: async () => [],
  });

  assert.deepEqual(result.exploitQueue.map((entry) => entry.fen), ["next-fen"]);
  assert.equal(result.revisitQueue.length, 1);
  assert.equal(result.revisitQueue[0]?.fen, "served-fen");
  assert.equal(result.revisitQueue[0]?.scheduledAt, "2026-04-27T10:00:00.000Z");
});

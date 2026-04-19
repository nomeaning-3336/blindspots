import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const timeManagement: typeof import("../lib/performance-time-management") = require("../lib/performance-time-management.ts");

const {
  buildTimeBucketSummaries,
  deriveBestThinkZone,
  deriveOverthinkMetrics,
  deriveRushErrorRatePct,
  getThinkTimeBucketKey,
  summarizeTimeManagementSide,
} = timeManagement;

type ThinkTimeBucketSummary = import("../lib/performance-time-management").ThinkTimeBucketSummary;
type TimeManagementMoveSample = import("../lib/performance-time-management").TimeManagementMoveSample;
type TimeManagementSourceGame = import("../lib/performance-time-management").TimeManagementSourceGame;

function createGame(
  overrides: Partial<TimeManagementSourceGame> = {},
): TimeManagementSourceGame {
  return {
    totalPlies: 8,
    userColor: "white",
    userMoveDurations: [2, 8, 18, 36],
    opponentMoveDurations: [3, 9, 20, 35],
    userMoveCpLosses: [20, 80, 140, 40],
    opponentMoveCpLosses: [30, 60, 110, 45],
    ...overrides,
  };
}

test("getThinkTimeBucketKey uses the expected bucket boundaries", () => {
  assert.equal(getThinkTimeBucketKey(0), "under5");
  assert.equal(getThinkTimeBucketKey(4.99), "under5");
  assert.equal(getThinkTimeBucketKey(5), "5to15");
  assert.equal(getThinkTimeBucketKey(14.99), "5to15");
  assert.equal(getThinkTimeBucketKey(15), "15to30");
  assert.equal(getThinkTimeBucketKey(29.99), "15to30");
  assert.equal(getThinkTimeBucketKey(30), "30plus");
});

test("deriveRushErrorRatePct measures how many errors came from rushed moves", () => {
  const buckets = buildTimeBucketSummaries([
    { bucketKey: "under5", durationSeconds: 2, cpLoss: 120, accuracyPct: 42 },
    { bucketKey: "under5", durationSeconds: 4, cpLoss: 320, accuracyPct: 9 },
    { bucketKey: "5to15", durationSeconds: 9, cpLoss: 150, accuracyPct: 34 },
  ]);

  assert.equal(deriveRushErrorRatePct(buckets), 66.7);
});

test("deriveBestThinkZone prefers the highest accuracy bucket and breaks ties by move count", () => {
  const buckets = buildTimeBucketSummaries([
    { bucketKey: "under5", durationSeconds: 2, cpLoss: 80, accuracyPct: 56.5 },
    { bucketKey: "5to15", durationSeconds: 8, cpLoss: 20, accuracyPct: 86.7 },
    { bucketKey: "5to15", durationSeconds: 10, cpLoss: 20, accuracyPct: 86.7 },
    { bucketKey: "15to30", durationSeconds: 20, cpLoss: 20, accuracyPct: 86.7 },
  ]);

  const best = deriveBestThinkZone(buckets);

  assert.equal(best.signal, "accuracy");
  assert.equal(best.bucket?.key, "5to15");
});

test("deriveBestThinkZone falls back to lower average CPL when accuracy is unavailable", () => {
  const buckets: ThinkTimeBucketSummary[] = [
    {
      key: "under5",
      label: "0-5s",
      moveCount: 4,
      moveSharePct: 40,
      qualityMoveCount: 0,
      accuracyPct: null,
      blunderRatePct: null,
      mistakeRatePct: null,
      avgCpl: 55,
      mistakes: 0,
      blunders: 0,
    },
    {
      key: "5to15",
      label: "5-15s",
      moveCount: 3,
      moveSharePct: 30,
      qualityMoveCount: 0,
      accuracyPct: null,
      blunderRatePct: null,
      mistakeRatePct: null,
      avgCpl: 32,
      mistakes: 0,
      blunders: 0,
    },
    {
      key: "15to30",
      label: "15-30s",
      moveCount: 2,
      moveSharePct: 20,
      qualityMoveCount: 0,
      accuracyPct: null,
      blunderRatePct: null,
      mistakeRatePct: null,
      avgCpl: 44,
      mistakes: 0,
      blunders: 0,
    },
    {
      key: "30plus",
      label: "30s+",
      moveCount: 1,
      moveSharePct: 10,
      qualityMoveCount: 0,
      accuracyPct: null,
      blunderRatePct: null,
      mistakeRatePct: null,
      avgCpl: 48,
      mistakes: 0,
      blunders: 0,
    },
  ];

  const best = deriveBestThinkZone(buckets);

  assert.equal(best.signal, "avgCpl");
  assert.equal(best.bucket?.key, "5to15");
});

test("deriveOverthinkMetrics returns the share of 30s+ moves that do not beat baseline", () => {
  const samples: TimeManagementMoveSample[] = [
    { bucketKey: "under5", durationSeconds: 2, cpLoss: 50, accuracyPct: 69.9 },
    { bucketKey: "5to15", durationSeconds: 9, cpLoss: 50, accuracyPct: 69.9 },
    { bucketKey: "30plus", durationSeconds: 31, cpLoss: 20, accuracyPct: 86.7 },
    { bucketKey: "30plus", durationSeconds: 42, cpLoss: 120, accuracyPct: 42.4 },
  ];

  const metrics = deriveOverthinkMetrics(samples);

  assert.equal(metrics.overthinkRatePct, 50);
  assert.equal(metrics.longThinkPayoffPct, 50);
});

test("summarizeTimeManagementSide tracks moves excluded by missing clocks", () => {
  const summary = summarizeTimeManagementSide(
    [
      createGame({
        totalPlies: 6,
        userColor: "white",
        userMoveDurations: [2, 12],
        userMoveCpLosses: [20, 40, 60],
      }),
    ],
    "user",
  );

  assert.equal(summary.totalMoves, 2);
  assert.equal(summary.excludedMoveCount, 1);
  assert.equal(summary.sampleSize, 1);
});

test("summarizeTimeManagementSide returns a neutral rush error state when no mistakes or blunders exist", () => {
  const summary = summarizeTimeManagementSide(
    [
      createGame({
        userMoveDurations: [2, 8, 18, 36],
        userMoveCpLosses: [10, 20, 30, 40],
      }),
    ],
    "user",
  );

  assert.equal(summary.rushErrorRatePct, null);
});

test("summarizeTimeManagementSide handles an empty dataset", () => {
  const summary = summarizeTimeManagementSide([], "user");

  assert.equal(summary.supported, false);
  assert.equal(summary.totalMoves, 0);
  assert.equal(summary.excludedMoveCount, 0);
  assert.equal(summary.bestThinkZone, null);
  assert.deepEqual(
    summary.buckets.map((bucket) => bucket.moveCount),
    [0, 0, 0, 0],
  );
});

export {};

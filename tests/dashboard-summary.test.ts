import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const dashboard: typeof import("../lib/dashboard") = require("../lib/dashboard.ts");

const { buildDashboardSummary } = dashboard;

test("builds dashboard summary from profile queues and completed sessions", () => {
  const summary = buildDashboardSummary({
    profile: {
      total_sequences: 3,
      blindspots_elo: 612,
      last_session_at: "2026-04-30T08:30:00.000Z",
      exploit_queue: ["a", "b"],
      explore_queue: ["c"],
      revisit_queue: ["d", "e", "f"],
      mastered_queue: ["g"],
      cluster_stats: {
        "app:v0:middlegame:opening_gambit": {
          attempts: 4,
          failures: 2,
          neutralCount: 1,
          successes: 1,
        },
      },
    },
    sessions: [
      {
        id: "session-1",
        completed_at: "2026-04-30T08:30:00.000Z",
        started_at: "2026-04-30T08:20:00.000Z",
        sequence_length: 4,
        elo_delta: -7,
        position_evaluations: [
          { classification: "excellent", clusterId: "app:v0:middlegame:opening_gambit" },
          { classification: "mistake", clusterId: "app:v0:middlegame:opening_gambit" },
          { classification: "blunder", clusterId: "app:v0:middlegame:opening_gambit" },
        ],
      },
      {
        id: "session-2",
        completed_at: "2026-04-29T08:30:00.000Z",
        started_at: "2026-04-29T08:20:00.000Z",
        sequence_length: 2,
        elo_delta: 12,
        position_evaluations: [{ classification: "good", clusterId: "app:v0:opening:wildcard" }],
      },
    ],
  });

  assert.equal(summary.totalSequences, 3);
  assert.equal(summary.movesEvaluated, 4);
  assert.equal(summary.blindspotsElo, 612);
  assert.equal(summary.eloDeltaSession, -7);
  assert.deepEqual(summary.queueCounts, {
    mastered: 1,
    revisit: 3,
    targeted: 2,
    explore: 1,
    inProgress: 6,
  });
  assert.equal(summary.classifications?.excellent, 1);
  assert.equal(summary.classifications?.good, 1);
  assert.equal(summary.classifications?.mistake, 1);
  assert.equal(summary.classifications?.blunder, 1);
  assert.equal(summary.classifications?.okay, 0);
  assert.equal(summary.recentSessions[0]?.worst, "blunder");
  assert.equal(summary.recentSessions[0]?.moves, 3);
  assert.equal(summary.recentSessions[0]?.href, null);
  assert.equal(summary.clusters[0]?.id, "app:v0:middlegame:opening_gambit");
  assert.equal(summary.clusters[0]?.severity, 7);
  assert.equal(summary.clusters[0]?.phase, "middlegame");
  assert.equal(summary.clusters[0]?.bucket, "opening_gambit");
});

test("uses empty-state fallbacks when profile and evaluations are missing", () => {
  const summary = buildDashboardSummary({ profile: null, sessions: [] });

  assert.equal(summary.totalSequences, 0);
  assert.equal(summary.movesEvaluated, 0);
  assert.equal(summary.blindspotsElo, null);
  assert.equal(summary.eloDeltaSession, null);
  assert.equal(summary.classifications, null);
  assert.deepEqual(summary.clusters, []);
  assert.deepEqual(summary.recentSessions, []);
});

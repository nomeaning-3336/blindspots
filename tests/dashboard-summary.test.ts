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
  assert.deepEqual(summary.clusters, []);
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

test("humanizes old v0 and new v1 cluster ids without exposing raw ids as labels", () => {
  const summary = buildDashboardSummary({
    profile: {
      total_sequences: 2,
      blindspots_elo: 612,
      last_session_at: null,
      exploit_queue: [],
      explore_queue: [],
      revisit_queue: [],
      mastered_queue: [],
      cluster_stats: {},
    },
    sessions: [
      {
        id: "session-1",
        completed_at: "2026-04-30T08:30:00.000Z",
        started_at: "2026-04-30T08:20:00.000Z",
        sequence_length: 4,
        elo_delta: -4,
        position_evaluations: [
          { classification: "mistake", clusterId: "app:v0:middlegame:middlegame" },
          { classification: "mistake", clusterId: "app:v0:middlegame:middlegame" },
          { classification: "mistake", clusterId: "app:v0:middlegame:middlegame" },
          { classification: "mistake", clusterId: "app:v0:middlegame:middlegame" },
          { classification: "mistake", clusterId: "app:v0:middlegame:middlegame" },
          { classification: "blunder", clusterId: "app:v1:middlegame:middlegame_attack:attack" },
          { classification: "blunder", clusterId: "app:v1:middlegame:middlegame_attack:attack" },
          { classification: "blunder", clusterId: "app:v1:middlegame:middlegame_attack:attack" },
          { classification: "blunder", clusterId: "app:v1:middlegame:middlegame_attack:attack" },
          { classification: "blunder", clusterId: "app:v1:middlegame:middlegame_attack:attack" },
          { classification: "inaccuracy", clusterId: "app:v1:endgame:endgame_rook:rook_endgame" },
          { classification: "inaccuracy", clusterId: "app:v1:endgame:endgame_rook:rook_endgame" },
          { classification: "inaccuracy", clusterId: "app:v1:endgame:endgame_rook:rook_endgame" },
          { classification: "inaccuracy", clusterId: "app:v1:endgame:endgame_rook:rook_endgame" },
          { classification: "inaccuracy", clusterId: "app:v1:endgame:endgame_rook:rook_endgame" },
          { classification: "mistake", clusterId: "app:v1:tactic:tactic:tactic" },
          { classification: "mistake", clusterId: "app:v1:tactic:tactic:tactic" },
          { classification: "mistake", clusterId: "app:v1:tactic:tactic:tactic" },
          { classification: "mistake", clusterId: "app:v1:tactic:tactic:tactic" },
          { classification: "mistake", clusterId: "app:v1:tactic:tactic:tactic" },
          { classification: "mistake", clusterId: "app:v1:opening:opening:b90" },
          { classification: "mistake", clusterId: "app:v1:opening:opening:b90" },
          { classification: "mistake", clusterId: "app:v1:opening:opening:b90" },
          { classification: "mistake", clusterId: "app:v1:opening:opening:b90" },
          { classification: "mistake", clusterId: "app:v1:opening:opening:b90" },
        ],
      },
    ],
  });

  const labelsById = new Map(summary.clusters.map((cluster) => [cluster.id, cluster.label]));

  assert.equal(labelsById.get("app:v0:middlegame:middlegame"), "Middlegame");
  assert.equal(labelsById.get("app:v1:middlegame:middlegame_attack:attack"), "Middlegame — Attack");
  assert.equal(labelsById.get("app:v1:endgame:endgame_rook:rook_endgame"), "Endgame — Rook Endgame");
  assert.equal(labelsById.get("app:v1:tactic:tactic:tactic"), "Tactical Positions");
  assert.equal(labelsById.get("app:v1:opening:opening:b90"), "Opening — B90");
  for (const cluster of summary.clusters) {
    assert.notEqual(cluster.label, cluster.id);
  }
});

test("hides sparse unknown and wildcard clusters from dashboard patterns", () => {
  const repeated = Array.from({ length: 5 }, () => [
    { classification: "mistake", clusterId: "app:v1:unknown:wildcard" },
    { classification: "mistake", clusterId: "app:v1:opening:wildcard" },
    { classification: "mistake", clusterId: "app:v1:middlegame:middlegame_attack:attack" },
  ]).flat();

  const summary = buildDashboardSummary({
    profile: {
      total_sequences: 1,
      blindspots_elo: 612,
      last_session_at: null,
      exploit_queue: [],
      explore_queue: [],
      revisit_queue: [],
      mastered_queue: [],
      cluster_stats: {},
    },
    sessions: [
      {
        id: "session-1",
        completed_at: "2026-04-30T08:30:00.000Z",
        started_at: "2026-04-30T08:20:00.000Z",
        sequence_length: 4,
        elo_delta: -4,
        position_evaluations: [
          { classification: "blunder", clusterId: "app:v1:endgame:endgame_rook:rook_endgame" },
          ...repeated,
        ],
      },
    ],
  });

  assert.equal(summary.clusters.length, 1);
  assert.equal(summary.clusters[0]?.id, "app:v1:middlegame:middlegame_attack:attack");
});

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
    mistakes: [],
    avgCpLoss: null,
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
  const summary = buildDashboardSummary({ profile: null, sessions: [], mistakes: [], avgCpLoss: null });

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
    mistakes: [],
    avgCpLoss: null,
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
    mistakes: [],
    avgCpLoss: null,
  });

  assert.equal(summary.clusters.length, 1);
  assert.equal(summary.clusters[0]?.id, "app:v1:middlegame:middlegame_attack:attack");
});

test("queue overview counts due active app-training mistake toward reviewDue and active", () => {
  const summary = buildDashboardSummary({
    profile: null,
    sessions: [],
    mistakes: [
      {
        id: "mistake-1",
        source_type: "app_training",
        starting_fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        status: "active",
        opening_name: null,
        review_count: 0,
        pass_count: 0,
        acceptable_count: 0,
        fail_count: 0,
        last_attempt_at: null,
        next_review_at: "2020-01-01T00:00:00Z",
        cp_loss: 85,
        served_count: 0,
      },
    ],
  });

  assert.equal(summary.queueOverview.reviewDue, 1);
  assert.equal(summary.queueOverview.active, 1);
  assert.equal(summary.queueOverview.filler, 0);
  assert.equal(summary.queueOverview.mastered, 0);
  assert.equal(summary.queueOverview.retired, 0);
});

test("queue overview counts non-due active app-training mistake only in active", () => {
  const summary = buildDashboardSummary({
    profile: null,
    sessions: [],
    mistakes: [
      {
        id: "mistake-1",
        source_type: "app_training",
        starting_fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        status: "active",
        opening_name: null,
        review_count: 0,
        pass_count: 0,
        acceptable_count: 0,
        fail_count: 0,
        last_attempt_at: null,
        next_review_at: "2099-01-01T00:00:00Z",
        cp_loss: 85,
        served_count: 0,
      },
    ],
  });

  assert.equal(summary.queueOverview.reviewDue, 0);
  assert.equal(summary.queueOverview.active, 1);
  assert.equal(summary.queueOverview.filler, 0);
});

test("queue overview does not count app-training as filler even when not due", () => {
  const summary = buildDashboardSummary({
    profile: null,
    sessions: [],
    mistakes: [
      {
        id: "mistake-1",
        source_type: "app_training",
        starting_fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        status: "active",
        opening_name: null,
        review_count: 0,
        pass_count: 0,
        acceptable_count: 0,
        fail_count: 0,
        last_attempt_at: null,
        next_review_at: null,
        cp_loss: 85,
        served_count: 0,
      },
    ],
  });

  assert.equal(summary.queueOverview.filler, 0);
  assert.equal(summary.queueOverview.active, 1);
});

test("queue overview mixes app-training, legacy review, and filler correctly", () => {
  const summary = buildDashboardSummary({
    profile: null,
    sessions: [],
    mistakes: [
      // Due active app-training
      {
        id: "mistake-1",
        source_type: "app_training",
        starting_fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        status: "active",
        opening_name: null,
        review_count: 1,
        pass_count: 0,
        acceptable_count: 0,
        fail_count: 1,
        last_attempt_at: "2020-01-01T00:00:00Z",
        next_review_at: "2020-01-01T00:00:00Z",
        cp_loss: 350,
        served_count: 1,
      },
      // Due legacy review mistake
      {
        id: "mistake-2",
        source_type: "own_game",
        starting_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        status: "review",
        opening_name: null,
        review_count: 3,
        pass_count: 2,
        acceptable_count: 0,
        fail_count: 1,
        last_attempt_at: "2020-01-01T00:00:00Z",
        next_review_at: "2020-01-01T00:00:00Z",
        cp_loss: 120,
        served_count: 3,
      },
      // Filler
      {
        id: "mistake-3",
        source_type: "lichess_puzzle_filler",
        starting_fen: "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1",
        status: "active",
        opening_name: null,
        review_count: 0,
        pass_count: 0,
        acceptable_count: 0,
        fail_count: 0,
        last_attempt_at: null,
        next_review_at: null,
        cp_loss: 50,
        served_count: 0,
      },
      // Non-due active app-training
      {
        id: "mistake-4",
        source_type: "app_training",
        starting_fen: "rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2",
        status: "active",
        opening_name: null,
        review_count: 0,
        pass_count: 0,
        acceptable_count: 0,
        fail_count: 0,
        last_attempt_at: null,
        next_review_at: "2099-01-01T00:00:00Z",
        cp_loss: 85,
        served_count: 0,
      },
    ],
  });

  assert.equal(summary.queueOverview.reviewDue, 2); // app_training due + legacy review due
  assert.equal(summary.queueOverview.active, 2);    // both app_training (due + not-due)
  assert.equal(summary.queueOverview.filler, 1);
  assert.equal(summary.queueOverview.mastered, 0);
  assert.equal(summary.queueOverview.retired, 0);
});

test("sourceTypeLabel returns Training mistake for app_training", () => {
  const summary = buildDashboardSummary({
    profile: null,
    sessions: [],
    mistakes: [
      {
        id: "mistake-1",
        source_type: "app_training",
        starting_fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        status: "active",
        opening_name: null,
        review_count: 0,
        pass_count: 0,
        acceptable_count: 0,
        fail_count: 0,
        last_attempt_at: null,
        next_review_at: null,
        cp_loss: 85,
        served_count: 0,
      },
    ],
  });

  const pos = summary.positions.find((p) => p.id === "mistake-1");
  assert.notEqual(pos, undefined);
  assert.equal(pos!.sourceLabel, "Training mistake");
  assert.equal(pos!.sourceType, "app_training");
  assert.equal(pos!.statusLabel, "New");
  assert.equal(pos!.queueLabel, "Active");
});

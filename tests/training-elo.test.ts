import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const trainingElo: typeof import("../lib/training/elo") = require("../lib/training/elo.ts");

const { calculateEloUpdate, getKFactor, getOpponentElo, getStartingEloForSkillLevel, normalizeSkillLevel } = trainingElo;

test("skill level brackets map to onboarding starting Elo", () => {
  assert.equal(getStartingEloForSkillLevel("new_to_chess"), 0);
  assert.equal(getStartingEloForSkillLevel("beginner"), 500);
  assert.equal(getStartingEloForSkillLevel("intermediate"), 1000);
  assert.equal(getStartingEloForSkillLevel("advanced"), 1500);
  assert.equal(getStartingEloForSkillLevel("expert"), 2000);
});

test("expert is accepted as a normalized skill level", () => {
  assert.equal(normalizeSkillLevel("expert"), "expert");
});

test("opponent Elo is deterministic challenge Elo above a minimum floor", () => {
  assert.equal(getOpponentElo(0), 800);
  assert.equal(getOpponentElo(500), 800);
  assert.equal(getOpponentElo(1500), 1600);
  assert.equal(getOpponentElo(Number.NaN), 800);
});

test("calculateEloUpdate uses provided opponent Elo without resampling", () => {
  const update = calculateEloUpdate({
    currentElo: 1500,
    ratingDeviation: 650,
    totalSequences: 0,
    evalPreservationScore: 1,
    opponentElo: 1600,
  });

  assert.equal(update?.opponentElo, 1600);
});

test("early K factor is bounded below previous launch values", () => {
  assert.equal(getKFactor(0, 650), 423);
  assert.equal(getKFactor(4, 650), 293);
  assert.equal(getKFactor(9, 650), 160);
});

test("few inaccuracies session uses non-outlier clamp with small delta", () => {
  // 4 user moves with mild cpLoss, averageCpDelta ~52.5, worstCpDelta = 80
  const update = calculateEloUpdate({
    currentElo: 1500,
    ratingDeviation: 100,
    totalSequences: 25, // mature stage
    evalPreservationScore: 0.5,
    averageCpDelta: (50 + 80 + 30 + 50) / 4, // = 52.5
    worstCpDelta: 80,
  });

  assert.ok(update !== null);
  // actualScore = 0.75*(1 - 52.5/100) + 0.25*(1 - 80/350) = 0.75*0.475 + 0.25*0.7714 = 0.356 + 0.193 = 0.549
  assert.ok(update!.actualScore > 0.5 && update!.actualScore < 0.6);
  assert.ok(update!.actualScore > -0.25 && update!.actualScore < 1.15, "should NOT be an outlier");
  // non-outlier mature clamp is [-35, 35]
  assert.ok(Math.abs(update!.eloDelta) <= 35, `expected |eloDelta| <= 35, got ${update!.eloDelta}`);
});

test("catastrophic blunder into mate triggers outlier widened clamp", () => {
  // 4 moves: 86, 520, 600(capped), 600(capped) cpLoss equivalents → cpDeltas
  const deltas = [86, 520, 600, 600];
  const averageCpDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length; // 451.5
  const worstCpDelta = 600;

  const update = calculateEloUpdate({
    currentElo: 1500,
    ratingDeviation: 100,
    totalSequences: 25, // mature stage
    evalPreservationScore: 0,
    averageCpDelta,
    worstCpDelta,
  });

  assert.ok(update !== null);
  // averageScoreComponent = 1 - 451.5/100 = -3.515
  // worstMoveComponent = 1 - 600/350 = 1 - 1.714 = -0.714
  // raw = 0.75*(-3.515) + 0.25*(-0.714) = -2.636 - 0.179 = -2.815
  // clamped to [-0.75, 1.35] → -0.75
  assert.equal(update!.actualScore, -0.75, "should clamp to minimum -0.75");
  assert.ok(update!.actualScore < -0.25, "should be an outlier");
  // eloDelta uses the full actualScore of -0.75, so it's strongly negative
  assert.ok(update!.eloDelta < -20, `expected eloDelta < -20 for outlier, got ${update!.eloDelta}`);

  // Compare with non-outlier equivalent: a similar bad session without cpDelta fields
  // falls back to clamping evalPreservationScore(0) to [0,1] → actualScore=0
  const nonOutlier = calculateEloUpdate({
    currentElo: 1500,
    ratingDeviation: 100,
    totalSequences: 25,
    evalPreservationScore: 0,
  });
  assert.ok(nonOutlier !== null);
  assert.equal(nonOutlier!.actualScore, 0, "fallback clamps evalPreservationScore to [0,1]");
  assert.ok(Math.abs(update!.eloDelta) > Math.abs(nonOutlier!.eloDelta), "outlier should be more extreme");
});

test("crushing the engine delivers strongly positive outlier delta", () => {
  // 5 moves, 4 with cpDelta=0 and the last delivering mate so cpDelta=-600 (capped)
  const deltas = [0, 0, 0, 0, -600];
  const averageCpDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length; // -120
  const worstCpDelta = 0; // no move lost eval, worst is 0

  const update = calculateEloUpdate({
    currentElo: 1500,
    ratingDeviation: 100,
    totalSequences: 25, // mature stage
    evalPreservationScore: 1,
    averageCpDelta,
    worstCpDelta,
  });

  assert.ok(update !== null);
  // averageScoreComponent = 1 - (-120)/100 = 1 + 1.2 = 2.2
  // worstMoveComponent = 1 - 0/350 = 1
  // raw = 0.75*(2.2) + 0.25*(1) = 1.65 + 0.25 = 1.9
  // clamped to [-0.75, 1.35] → 1.35
  assert.equal(update!.actualScore, 1.35, "should clamp to maximum 1.35");
  assert.ok(update!.actualScore > 1.15, "should be an outlier");
  // actualScore=1.35 scores strongly positive
  assert.ok(update!.eloDelta > 20, `expected eloDelta > 20 for outlier crush, got ${update!.eloDelta}`);
});

test("legacy fallback: only evalPreservationScore set returns same result as before", () => {
  const update = calculateEloUpdate({
    currentElo: 1500,
    ratingDeviation: 100,
    totalSequences: 25,
    evalPreservationScore: 0.5,
  });

  assert.ok(update !== null);
  // actualScore should fall back to clamped evalPreservationScore [0, 1]
  assert.equal(update!.actualScore, 0.5);
  assert.ok(Math.abs(update!.eloDelta) <= 35, "should use non-outlier clamp");
});

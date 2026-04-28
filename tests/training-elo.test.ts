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

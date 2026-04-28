import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const trainingElo: typeof import("../lib/training/elo") = require("../lib/training/elo.ts");

const { getStartingEloForSkillLevel, normalizeSkillLevel } = trainingElo;

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

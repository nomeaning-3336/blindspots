import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const classification: typeof import("../lib/move-classification") = require("../lib/move-classification.ts");

const { classifyMoveAgainstBest, classifyRankedMove, isRecommendableClassification } = classification;

const WHITE_TO_MOVE_FEN = "8/8/8/8/8/8/8/K6k w - - 0 1";
const BLACK_TO_MOVE_FEN = "8/8/8/8/8/8/8/K6k b - - 0 1";

test("classifies with analysis page centipawn thresholds", () => {
  const best = { cp: 500, bestMove: "a1a2" };

  assert.equal(classifyMoveAgainstBest(best, { cp: 470, bestMove: "a1b1" }, WHITE_TO_MOVE_FEN), "excellent");
  assert.equal(classifyMoveAgainstBest(best, { cp: 410, bestMove: "a1b1" }, WHITE_TO_MOVE_FEN), "good");
  assert.equal(classifyMoveAgainstBest(best, { cp: 320, bestMove: "a1b1" }, WHITE_TO_MOVE_FEN), "inaccuracy");
  assert.equal(classifyMoveAgainstBest(best, { cp: 180, bestMove: "a1b1" }, WHITE_TO_MOVE_FEN), "mistake");
  assert.equal(classifyMoveAgainstBest(best, { cp: 179, bestMove: "a1b1" }, WHITE_TO_MOVE_FEN), "blunder");
});

test("uses side-to-move perspective for black positions", () => {
  const best = { cp: -500, bestMove: "h1h2" };

  assert.equal(classifyMoveAgainstBest(best, { cp: -410, bestMove: "h1g1" }, BLACK_TO_MOVE_FEN), "good");
  assert.equal(classifyMoveAgainstBest(best, { cp: -179, bestMove: "h1g1" }, BLACK_TO_MOVE_FEN), "blunder");
});

test("classifies ranked rows against the first full-position row", () => {
  const lines = [
    { cp: 200, bestMove: "a1a2" },
    { cp: -140, bestMove: "a1b1" },
  ];

  assert.equal(classifyRankedMove(0, lines, WHITE_TO_MOVE_FEN), "best");
  assert.equal(classifyRankedMove(1, lines, WHITE_TO_MOVE_FEN), "blunder");
  assert.equal(isRecommendableClassification("inaccuracy"), false);
  assert.equal(isRecommendableClassification("good"), true);
});

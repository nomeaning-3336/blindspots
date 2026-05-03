import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const classification: typeof import("../lib/move-classification") = require("../lib/move-classification.ts");

const { classifyEvaluatedMove, classifyMoveAgainstBest, classifyRankedMove, isRecommendableClassification } = classification;

const WHITE_TO_MOVE_FEN = "8/8/8/8/8/8/8/K6k w - - 0 1";
const BLACK_TO_MOVE_FEN = "8/8/8/8/8/8/8/K6k b - - 0 1";

test("classifies with En Croissant win-chance thresholds and legacy display names", () => {
  const best = { cp: 500, bestMove: "a1a2" };

  assert.equal(classifyMoveAgainstBest(best, { cp: 470, bestMove: "a1b1" }, WHITE_TO_MOVE_FEN), "okay");
  assert.equal(classifyMoveAgainstBest(best, { cp: 410, bestMove: "a1b1" }, WHITE_TO_MOVE_FEN), "okay");
  assert.equal(classifyMoveAgainstBest(best, { cp: 320, bestMove: "a1b1" }, WHITE_TO_MOVE_FEN), "inaccuracy");
  assert.equal(classifyMoveAgainstBest(best, { cp: 180, bestMove: "a1b1" }, WHITE_TO_MOVE_FEN), "blunder");
  assert.equal(classifyMoveAgainstBest(best, { cp: 179, bestMove: "a1b1" }, WHITE_TO_MOVE_FEN), "blunder");
});

test("uses side-to-move perspective for black positions", () => {
  const best = { cp: -500, bestMove: "h1h2" };

  assert.equal(classifyMoveAgainstBest(best, { cp: -410, bestMove: "h1g1" }, BLACK_TO_MOVE_FEN), "okay");
  assert.equal(classifyMoveAgainstBest(best, { cp: -179, bestMove: "h1g1" }, BLACK_TO_MOVE_FEN), "blunder");
});

test("keeps En Croissant brilliant annotation alongside legacy names", () => {
  assert.equal(
    classifyEvaluatedMove({
      previous: { cp: 500, bestMove: "a1a2" },
      next: { cp: 500, bestMove: "a1a2" },
      color: "w",
      prevMoves: [
        { cp: 500, bestMove: "a1a2" },
        { cp: 100, bestMove: "a1b1" },
      ],
      isSacrifice: true,
      move: "a1a2",
    }),
    "brilliant",
  );
});

test("classifies ranked rows against the first full-position row", () => {
  const lines = [
    { cp: 200, bestMove: "a1a2" },
    { cp: -140, bestMove: "a1b1" },
  ];

  assert.equal(classifyRankedMove(0, lines, WHITE_TO_MOVE_FEN), "critical");
  assert.equal(classifyRankedMove(1, lines, WHITE_TO_MOVE_FEN), "blunder");
  assert.equal(isRecommendableClassification("inaccuracy"), false);
  assert.equal(isRecommendableClassification("good"), true);
});

test("marks best moves as critical when every alternative is dangerous", () => {
  const lines = [
    { cp: 500, bestMove: "a1a2" },
    { cp: 180, bestMove: "a1b1" },
    { cp: 100, bestMove: "a1c1" },
  ];

  assert.equal(classifyRankedMove(0, lines, WHITE_TO_MOVE_FEN), "critical");
  assert.equal(isRecommendableClassification("critical"), true);
});

test("keeps ordinary best moves as best when a playable alternative exists", () => {
  const lines = [
    { cp: 500, bestMove: "a1a2" },
    { cp: 470, bestMove: "a1b1" },
  ];

  assert.equal(classifyRankedMove(0, lines, WHITE_TO_MOVE_FEN), "best");
});

test("marks best moves as critical when alternatives walk into mate", () => {
  const lines = [
    { cp: 0, mate: null, bestMove: "a1a2" },
    { cp: -1000, mate: -2, bestMove: "a1b1" },
  ];

  assert.equal(classifyRankedMove(0, lines, WHITE_TO_MOVE_FEN), "critical");
});

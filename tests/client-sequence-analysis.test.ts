import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeClientSequence,
} from "../lib/stockfish-client/sequence-analysis.ts";
import { classifyTrainingOutcome } from "../lib/training/mistake-srs.ts";

test("client sequence analysis evaluates only learner-side moves", async () => {
  const analysis = await analyzeClientSequence({
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    moveUcis: ["e2e4", "e7e5", "g1f3"],
    learnerSide: "w",
    evaluateFen: async (fen) => ({
      cp: fen.includes(" w ") ? 100 : -70,
      mate: null,
      bestMoveUci: "e1d1",
      bestLineUcis: ["e1d1"],
    }),
  });

  assert.equal(analysis.learnerSide, "w");
  assert.equal(analysis.learnerMoves.length, 2);
  assert.deepEqual(
    analysis.learnerMoves.map((move) => move.playedUci),
    ["e2e4", "g1f3"],
  );
  assert.equal(analysis.averageCpLoss, 30);
  assert.equal(analysis.maxSingleCpLoss, 30);
});

test("client sequence analysis treats learner-delivered checkmate as best", async () => {
  const analysis = await analyzeClientSequence({
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    moveUcis: ["f2f3", "e7e5", "g2g4", "d8h4"],
    learnerSide: "b",
    evaluateFen: async () => ({
      cp: 0,
      mate: null,
      bestMoveUci: "d8h4",
      bestLineUcis: ["d8h4"],
    }),
  });

  assert.equal(analysis.terminal.checkmate, true);
  assert.equal(analysis.learnerMoves[1]?.playedUci, "d8h4");
  assert.equal(analysis.learnerMoves[1]?.cpLoss, 0);
  assert.equal(analysis.learnerMoves[1]?.classification, "best");
  assert.equal(analysis.trainingOutcome, "pass");
});

test("client analysis uses the shared classifyTrainingOutcome function", async () => {
  // average=49, max=300 → pass (shared: avg<50, max<=300)
  const analysis = await analyzeClientSequence({
    startingFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    moveUcis: ["e2e4", "e7e5"],
    learnerSide: "w",
    evaluateFen: async (_fen) => ({
      cp: 49,
      mate: null,
      bestMoveUci: null,
      bestLineUcis: [],
    }),
  });
  assert.equal(analysis.trainingOutcome, classifyTrainingOutcome({ averageCpLoss: analysis.averageCpLoss, maxSingleCpLoss: analysis.maxSingleCpLoss }));
});

test("shared outcome boundary: average 49 max 300 → pass", () => {
  assert.equal(classifyTrainingOutcome({ averageCpLoss: 49, maxSingleCpLoss: 300 }), "pass");
});

test("shared outcome boundary: average 50 max 300 → acceptable", () => {
  assert.equal(classifyTrainingOutcome({ averageCpLoss: 50, maxSingleCpLoss: 300 }), "acceptable");
});

test("shared outcome boundary: average 149 max 300 → acceptable", () => {
  assert.equal(classifyTrainingOutcome({ averageCpLoss: 149, maxSingleCpLoss: 300 }), "acceptable");
});

test("shared outcome boundary: average 150 max 0 → fail", () => {
  assert.equal(classifyTrainingOutcome({ averageCpLoss: 150, maxSingleCpLoss: 0 }), "fail");
});

test("shared outcome boundary: average 20 max 301 → fail", () => {
  assert.equal(classifyTrainingOutcome({ averageCpLoss: 20, maxSingleCpLoss: 301 }), "fail");
});

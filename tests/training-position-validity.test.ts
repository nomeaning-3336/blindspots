import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const validity: typeof import("../lib/training/position-validity") =
  require("../lib/training/position-validity.ts");

const {
  validatePlayableTrainingFen,
  validateSetupMoveResult,
  validateTrainingQueueItem,
} = validity;

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const CHECKMATE_FEN = "7k/6Q1/6K1/8/8/8/8/8 b - - 0 1";
const STALEMATE_FEN = "7k/5K2/6Q1/8/8/8/8/8 b - - 0 1";

const QXG7_MATE_PREVIOUS_FEN = "7k/6p1/5K2/8/8/6Q1/8/8 w - - 0 1";
const QXG7_MATE_AFTER_FEN = "7k/6Q1/5K2/8/8/8/8/8 b - - 0 1";

test("normal playable FEN is valid", () => {
  const result = validatePlayableTrainingFen(START_FEN);

  assert.equal(result.ok, true);
  assert.equal(result.reason, undefined);
  assert.ok((result.legalMoveCount ?? 0) > 0);
});

test("checkmate FEN is rejected", () => {
  const result = validatePlayableTrainingFen(CHECKMATE_FEN);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "checkmate");
  assert.equal(result.terminal, true);
  assert.equal(result.legalMoveCount, 0);
});

test("stalemate FEN is rejected", () => {
  const result = validatePlayableTrainingFen(STALEMATE_FEN);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "stalemate");
  assert.equal(result.terminal, true);
  assert.equal(result.legalMoveCount, 0);
});

test("invalid FEN is rejected", () => {
  const result = validatePlayableTrainingFen("not a fen");

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_fen");
});

test("setup move that checkmates is rejected", () => {
  const result = validateSetupMoveResult(
    QXG7_MATE_PREVIOUS_FEN,
    "g3g7",
    QXG7_MATE_AFTER_FEN,
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "setup_checkmate");
});

test("training candidate whose setup move checkmates is rejected", () => {
  const result = validateTrainingQueueItem({
    fen: QXG7_MATE_AFTER_FEN,
    previousFen: QXG7_MATE_PREVIOUS_FEN,
    playedMove: "g3g7",
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "checkmate");
});

test("mate distance shorter than requested sequence is rejected when metadata exists", () => {
  const result = validateTrainingQueueItem({
    fen: START_FEN,
    mateDistancePlies: 1,
  }, { sequenceLength: 4 });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "mate_in_less_than_sequence");
});

test("mate distance longer than requested sequence is allowed when position is playable", () => {
  const result = validateTrainingQueueItem({
    fen: START_FEN,
    mateDistancePlies: 8,
  }, { sequenceLength: 4 });

  assert.equal(result.ok, true);
});
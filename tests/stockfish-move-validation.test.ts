import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const stockfish: typeof import("../lib/engines/stockfish") = require("../lib/engines/stockfish.ts");

const {
  EngineError,
  assertValidEngineMove,
  isValidUciMove,
} = stockfish;

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("validates normal UCI moves", () => {
  assert.equal(isValidUciMove("e2e4"), true);
  assert.equal(isValidUciMove("a7a8q"), true);
});

test("rejects Stockfish no-move sentinel as invalid UCI", () => {
  assert.equal(isValidUciMove("(none)"), false);
  assert.equal(isValidUciMove(null), false);
  assert.equal(isValidUciMove(undefined), false);
});

test("engine no-move sentinel raises a classified engine error", () => {
  assert.throws(
    () => assertValidEngineMove(START_FEN, "(none)"),
    (error: unknown) =>
      error instanceof EngineError &&
      error.code === "engine_error" &&
      !String(error.message).includes('{"from"'),
  );
});

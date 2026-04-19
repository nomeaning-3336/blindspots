import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const analysisGame: typeof import("../lib/performance-analysis-game") = require("../lib/performance-analysis-game.ts");

const {
  resolveClientAnalysisGame,
  resolveClientAnalysisMoveCount,
} = analysisGame;

type ClientAnalysisTaskGame = import("../lib/performance-client-analysis").ClientAnalysisTaskGame;

function createTaskGame(
  overrides: Partial<ClientAnalysisTaskGame> = {},
): ClientAnalysisTaskGame {
  return {
    id: "game-1",
    endTimeMs: 1,
    userColor: "white",
    movesUci: "e4 e5 Nf3 Nc6 Bc4",
    pgn: undefined,
    userMoveCpLosses: [],
    userMovePieceTypes: [],
    ...overrides,
  };
}

test("resolveClientAnalysisGame normalizes SAN move lists into UCI and user piece types", () => {
  const resolved = resolveClientAnalysisGame(
    createTaskGame({
      movesUci: "e4 e5 Nf3 Nc6 Bc4",
    }),
  );

  assert.deepEqual(resolved, {
    movesUci: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"],
    userMovePieceTypes: ["pawn", "knight", "bishop"],
  });
});

test("resolveClientAnalysisGame keeps valid cached piece types when they already match the move count", () => {
  const resolved = resolveClientAnalysisGame(
    createTaskGame({
      movesUci: "e2e4 e7e5 g1f3",
      userMovePieceTypes: ["pawn", "knight"],
    }),
  );

  assert.deepEqual(resolved?.userMovePieceTypes, ["pawn", "knight"]);
});

test("resolveClientAnalysisGame falls back to PGN when only PGN is available", () => {
  const resolved = resolveClientAnalysisGame(
    createTaskGame({
      movesUci: undefined,
      pgn: "[Event \"Test\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *",
    }),
  );

  assert.deepEqual(resolved, {
    movesUci: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"],
    userMovePieceTypes: ["pawn", "knight", "bishop"],
  });
});

test("resolveClientAnalysisMoveCount respects the user's color", () => {
  assert.equal(
    resolveClientAnalysisMoveCount(
      createTaskGame({
        userColor: "white",
        movesUci: "e4 e5 Nf3",
      }),
    ),
    2,
  );
  assert.equal(
    resolveClientAnalysisMoveCount(
      createTaskGame({
        userColor: "black",
        movesUci: "e4 e5 Nf3",
      }),
    ),
    1,
  );
});

export {};

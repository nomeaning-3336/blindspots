import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const helpers: typeof import("../lib/training/corpus-helpers") =
  require("../lib/training/corpus-helpers.ts");

const {
  normalizeFenKey,
  classifyPhase,
  isEndgameMaterial,
  countPieces,
  isTerminalPosition,
  isValidFen,
  buildCandidateRow,
  sideToMoveFromFen,
} = helpers;

// --- normalizeFenKey ---

test("normalizeFenKey includes board, side, castling, en passant", () => {
  assert.equal(
    normalizeFenKey("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
  );
});

test("normalizeFenKey excludes halfmove and fullmove counters", () => {
  const a = normalizeFenKey("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
  const b = normalizeFenKey("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 3 42");
  assert.equal(a, b);
});

test("normalizeFenKey returns empty string for invalid FEN", () => {
  assert.equal(normalizeFenKey("garbage"), "");
});

// --- classifyPhase ---

test("classifyPhase returns opening for ply <= 20", () => {
  assert.equal(
    classifyPhase(8, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"),
    "opening",
  );
  assert.equal(
    classifyPhase(20, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"),
    "opening",
  );
});

test("classifyPhase returns middlegame for ply 21-70 with sufficient material", () => {
  const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
  assert.equal(classifyPhase(30, fen), "middlegame");
  assert.equal(classifyPhase(70, fen), "middlegame");
});

test("classifyPhase returns endgame for few pieces", () => {
  const fen = "8/8/8/8/8/4k3/4P3/4K3 w - - 0 1";
  assert.equal(classifyPhase(30, fen), "endgame");
});

test("classifyPhase returns endgame for no queens and low non-pawn material", () => {
  const fen = "8/5k2/8/5r2/8/8/5K2/8 w - - 0 60";
  assert.equal(classifyPhase(60, fen), "endgame");
});

// --- isEndgameMaterial ---

test("isEndgameMaterial returns true for <= 10 pieces", () => {
  const fen = "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"; // 3 pieces
  assert.equal(isEndgameMaterial(fen), true);
});

test("isEndgameMaterial returns false for many pieces", () => {
  const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"; // 32 pieces
  assert.equal(isEndgameMaterial(fen), false);
});

test("isEndgameMaterial returns true for no queens + low non-pawn material", () => {
  // 2 rooks + kings = 4 non-pawn pieces, no queens
  const fen = "8/5k2/8/5r2/8/8/5R2/5K2 w - - 0 1";
  assert.equal(isEndgameMaterial(fen), true);
});

// --- countPieces ---

test("countPieces returns 32 for starting position", () => {
  assert.equal(countPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"), 32);
});

test("countPieces returns 3 for KP vs K", () => {
  assert.equal(countPieces("8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"), 3);
});

// --- isTerminalPosition ---

test("isTerminalPosition returns true for checkmate", () => {
  // KQk — black king a8, white king a6, white queen b6, black to move in checkmate
  assert.equal(isTerminalPosition("k7/8/KQ6/8/8/8/8/8 b - - 0 1"), true);
});

test("isTerminalPosition returns true for stalemate", () => {
  assert.equal(isTerminalPosition("k7/8/1Q6/8/8/8/8/7K b - - 0 1"), true); // black has no legal moves, not in check
});

test("isTerminalPosition returns false for active position", () => {
  assert.equal(
    isTerminalPosition("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
    false,
  );
});

test("isTerminalPosition returns true for invalid FEN", () => {
  assert.equal(isTerminalPosition("not-a-fen"), true);
});

// --- isValidFen ---

test("isValidFen returns true for valid FEN", () => {
  assert.equal(isValidFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"), true);
});

test("isValidFen returns false for invalid FEN", () => {
  assert.equal(isValidFen("garbage"), false);
});

// --- buildCandidateRow ---

test("buildCandidateRow includes all required fields", () => {
  const row = buildCandidateRow({
    previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    playedMove: "e2e4",
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    phase: "opening",
    sourceType: "pgn",
    sourceGameId: "game123",
    sourcePly: 1,
    tags: ["test"],
  });

  assert.equal(row.id, "game123_1");
  assert.equal(row.fen, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
  assert.equal(row.previousFen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  assert.equal(row.playedMove, "e2e4");
  assert.equal(row.phase, "opening");
  assert.equal(row.sourceType, "pgn");
  assert.equal(row.sourceGameId, "game123");
  assert.equal(row.sourcePly, 1);
  assert.equal(row.sideToMove, "black");
  assert.ok(Array.isArray(row.tags));
  assert.ok(typeof row.createdAt === "string");
});

test("buildCandidateRow sets sideToMove to white correctly", () => {
  const row = buildCandidateRow({
    previousFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    playedMove: "e7e5",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    phase: "opening",
    sourceType: "pgn",
    sourceGameId: "game123",
    sourcePly: 2,
  });

  assert.equal(row.sideToMove, "white");
});

// --- sideToMoveFromFen ---

test("sideToMoveFromFen returns white for white-to-move FEN", () => {
  assert.equal(
    sideToMoveFromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
    "white",
  );
});

test("sideToMoveFromFen returns black for black-to-move FEN", () => {
  assert.equal(
    sideToMoveFromFen("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"),
    "black",
  );
});

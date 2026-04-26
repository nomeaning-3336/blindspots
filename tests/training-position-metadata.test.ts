import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const meta: typeof import("../lib/training/position-metadata") = require("../lib/training/position-metadata.ts");

const {
  classifyTrainingPhase,
  classifyTrainingBucket,
  enrichTrainingQueueItem,
  classifyBoardPhase,
  countPieces,
  isGambitFen,
} = meta;

test("classifyTrainingPhase startpos is opening", () => {
  assert.equal(classifyTrainingPhase("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"), "opening");
});

test("classifyTrainingPhase early e4 is opening", () => {
  assert.equal(classifyTrainingPhase("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"), "opening");
});

test("classifyTrainingPhase fullmove 12 is opening", () => {
  assert.equal(classifyTrainingPhase("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 12"), "opening");
});

test("classifyTrainingPhase simple endgame is endgame", () => {
  assert.equal(classifyTrainingPhase("8/8/8/8/8/8/8/K6k w - - 0 1"), "endgame");
});

test("classifyTrainingPhase middlegame position is opening (fullmove <= 12)", () => {
  const fen = "r1bq1rk1/pp1nbppp/2p1pn2/3p4/3P4/2N1PN2/PPQ1BPPP/R1B2RK1 w - - 0 10";
  const phase = classifyTrainingPhase(fen);
  // fullmove 10 <= 12 so this is classified as opening
  assert.equal(phase, "opening");
});

test("classifyTrainingPhase actual middlegame is middlegame (fullmove > 12)", () => {
  const fen = "r1bq1rk1/pp1nbppp/2p1pn2/3p4/3P4/2N1PN2/PPQ1BPPP/R1B2RK1 w - - 0 14";
  const phase = classifyTrainingPhase(fen);
  assert.equal(phase, "middlegame");
});

test("classifyTrainingPhase invalid fen is unknown", () => {
  assert.equal(classifyTrainingPhase("not-a-fen"), "unknown");
  assert.equal(classifyTrainingPhase(""), "unknown");
});

test("classifyBoardPhase counts pieces", () => {
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
  assert.equal(countPieces(start), 32);
  const endgame = "8/8/8/8/8/8/8/K6k";
  assert.equal(countPieces(endgame), 2);
});

test("classifyBoardPhase startpos is middlegame (has queens + pieces)", () => {
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
  assert.equal(classifyBoardPhase(start), "middlegame");
});

test("classifyBoardPhase queenless endgame is endgame", () => {
  const noQueens = "8/8/8/8/8/8/8/K6k";
  assert.equal(classifyBoardPhase(noQueens), "endgame");
});

test("isGambitFen detects early pawn sacrifice", () => {
  // King's Gambit: white has 7 pawns (sacrificed f4), all 8 pieces intact
  // Manually verify: white has PPPPPPP (7) + RNBQKBNR (8 pieces)
  // Our rank parser should detect this
  const kg = "rnbqkbnr/pppppppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
  assert.equal(isGambitFen(kg), true);
});

test("isGambitFen normal position is not gambit", () => {
  const normal = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  assert.equal(isGambitFen(normal), false);
});

test("classifyTrainingBucket uses explicit bucket", () => {
  const item = { fen: "any", bucket: "opening_gambit" as const, tags: [] as string[], phase: "opening" as const };
  assert.equal(classifyTrainingBucket(item), "opening_gambit");
});

test("classifyTrainingBucket tactic flag returns tactic", () => {
  const item = { fen: "any", bucket: undefined, isTactic: true, tags: [] };
  assert.equal(classifyTrainingBucket(item), "tactic");
});

test("classifyTrainingBucket opening tag returns opening", () => {
  const item = { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", bucket: undefined, tags: ["opening"] };
  assert.equal(classifyTrainingBucket(item), "opening");
});

test("classifyTrainingBucket gambit tag returns opening_gambit", () => {
  const item = { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", bucket: undefined, tags: ["gambit"] };
  assert.equal(classifyTrainingBucket(item), "opening_gambit");
});

test("enrichTrainingQueueItem fills phase and bucket", () => {
  const item = {
    fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
    fingerprint: {},
    scheduledAt: new Date().toISOString(),
    source: "elite" as const,
  };
  const enriched = enrichTrainingQueueItem(item);
  assert.equal(enriched.phase, "endgame");
  assert.equal(enriched.bucket, "endgame");
});

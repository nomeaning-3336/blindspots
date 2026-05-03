import assert from "node:assert";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const fenTransition: typeof import("../lib/training/fen-transition") = require("../lib/training/fen-transition.ts");
const { inferLegalMoveBetweenFens } = fenTransition;

describe("inferLegalMoveBetweenFens", () => {
  it("finds c6d5 from the real QA row", () => {
    const fromFen = "r2q3r/2p1k3/1pQpp2p/p1Pn4/3P4/2P2N2/P4PPP/R3R1K1 w - - 0 19";
    const toFen = "r2q3r/2p1k3/1p1pp2p/p1PQ4/3P4/2P2N2/P4PPP/R3R1K1 b - - 0 19";
    const result = inferLegalMoveBetweenFens({ fromFen, toFen });
    assert.strictEqual(result, "c6d5");
  });

  it("finds e2e4 from initial position", () => {
    // chess.js v1+ may not set en-passant square for 2-square pawn pushes
    const fromFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const toFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const result = inferLegalMoveBetweenFens({ fromFen, toFen });
    assert.strictEqual(result, "e2e4");
  });

  it("returns null when no legal move matches", () => {
    // From initial position, no single legal move reaches a completely different board
    const fromFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const toFen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
    const result = inferLegalMoveBetweenFens({ fromFen, toFen });
    assert.strictEqual(result, null);
  });

  it("returns null for same FEN", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = inferLegalMoveBetweenFens({ fromFen: fen, toFen: fen });
    assert.strictEqual(result, null);
  });

  it("returns null for invalid FEN", () => {
    const result = inferLegalMoveBetweenFens({
      fromFen: "not a fen",
      toFen: "also not a fen",
    });
    assert.strictEqual(result, null);
  });

  it("ignores halfmove and fullmove clock differences", () => {
    const fromFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    const toFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 12 34";
    const result = inferLegalMoveBetweenFens({ fromFen, toFen });
    assert.strictEqual(result, null); // same board, no move needed
  });
});

describe("normalized playedMove is transition, not actual move", () => {
  it("transition move differs from actual_move_uci", () => {
    // Simulating the QA case:
    const startingFen = "r2q3r/2p1k3/1pQpp2p/p1Pn4/3P4/2P2N2/P4PPP/R3R1K1 w - - 0 19";
    const decisionFen = "r2q3r/2p1k3/1p1pp2p/p1PQ4/3P4/2P2N2/P4PPP/R3R1K1 b - - 0 19";
    const actualMoveUci = "b6c5"; // user's blunder
    const actualMoveSan = "Qxc5";

    // playedMove should be the transition from starting -> decision, NOT the user's blunder
    const playedMove = inferLegalMoveBetweenFens({ fromFen: startingFen, toFen: decisionFen });

    assert.strictEqual(playedMove, "c6d5"); // opponent's move, not the user's
    assert.notStrictEqual(playedMove, actualMoveUci); // not the blunder
    assert.notStrictEqual(playedMove, actualMoveSan);
  });
});

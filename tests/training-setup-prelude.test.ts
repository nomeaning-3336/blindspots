import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const setupPrelude: typeof import("../lib/training/setup-prelude") =
  require("../lib/training/setup-prelude.ts");

const { normalizeSetupPrelude, validateSetupPrelude } = setupPrelude;

test("keeps valid setup prelude when previous move reaches served FEN", () => {
  const previousFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

  assert.deepEqual(normalizeSetupPrelude({ fen, previousFen, playedMove: "e2e4" }), {
    previousFen,
    playedMove: "e2e4",
  });
});

test("drops playedMove when previousFen is missing", () => {
  const fen = "q4b1k/5ppn/3p3p/3npP2/r4PB1/1pP1B2P/1Q6/1K1R2R1 w - - 0 28";

  assert.equal(normalizeSetupPrelude({ fen, playedMove: "g4f3" }), null);
});

test("drops mismatched setup prelude when move does not reach served FEN", () => {
  const previousFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const fen = "q4b1k/5ppn/3p3p/3npP2/r4PB1/1pP1B2P/1Q6/1K1R2R1 w - - 0 28";

  assert.equal(normalizeSetupPrelude({ fen, previousFen, playedMove: "e2e4" }), null);
});

test("reports stale castling rights when board and side match but exact FEN does not", () => {
  const previousFen = "r1bqk2r/ppp2ppp/2n2n2/3pp3/2B1P1b1/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 6";
  const fen = "r1bq1rk1/ppp2ppp/2n2n2/3pp3/2B1P1b1/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 7";

  assert.deepEqual(validateSetupPrelude({ fen, previousFen, playedMove: "e8g8" }), {
    ok: false,
    reason: "stale_castling_rights",
    fen,
    previousFen,
    playedMove: "e8g8",
    reachedFen: "r1bq1rk1/ppp2ppp/2n2n2/3pp3/2B1P1b1/2NP1N2/PPP2PPP/R1BQK2R w KQ - 1 7",
    boardPlacementMatches: true,
    sideToMoveMatches: true,
    castlingRightsMatch: false,
    enPassantMatch: true,
  });
});

test("reports illegal playedMove from previousFen", () => {
  const previousFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

  assert.deepEqual(validateSetupPrelude({ fen, previousFen, playedMove: "e7e5" }), {
    ok: false,
    reason: "illegal_played_move",
    fen,
    previousFen,
    playedMove: "e7e5",
  });
});

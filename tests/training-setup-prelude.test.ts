import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const setupPrelude: typeof import("../lib/training/setup-prelude") =
  require("../lib/training/setup-prelude.ts");

const { normalizeSetupPrelude } = setupPrelude;

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

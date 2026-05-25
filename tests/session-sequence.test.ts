import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLegalStoredSequence,
  countUserMovesInStoredSequence,
  storedSequenceIsPrefix,
} from "../lib/training/session-sequence.ts";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("session sequence derives legal SAN and move side from UCI moves", () => {
  const moves = buildLegalStoredSequence(STARTING_FEN, [
    "e2e4",
    "e7e5",
    "g1f3",
  ]);

  assert.ok(moves);
  assert.deepEqual(moves, [
    { san: "e4", uci: "e2e4", side: "w" },
    { san: "e5", uci: "e7e5", side: "b" },
    { san: "Nf3", uci: "g1f3", side: "w" },
  ]);
  assert.equal(countUserMovesInStoredSequence(STARTING_FEN, moves), 2);
});

test("session sequence rejects illegal submitted move lines", () => {
  assert.equal(
    buildLegalStoredSequence(STARTING_FEN, ["e2e4", "e7e5", "e1e5"]),
    null,
  );
});

test("session updates may extend but not rewrite stored move prefixes", () => {
  const existing = buildLegalStoredSequence(STARTING_FEN, ["e2e4", "e7e5"]);
  const extension = buildLegalStoredSequence(STARTING_FEN, ["e2e4", "e7e5", "g1f3"]);
  const rewrite = buildLegalStoredSequence(STARTING_FEN, ["d2d4", "d7d5"]);

  assert.ok(existing);
  assert.ok(extension);
  assert.ok(rewrite);
  assert.equal(storedSequenceIsPrefix(existing, extension), true);
  assert.equal(storedSequenceIsPrefix(existing, rewrite), false);
});

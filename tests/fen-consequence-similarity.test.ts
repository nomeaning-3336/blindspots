import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { Chess } from "chess.js";

const require = createRequire(import.meta.url);
const fenSimilarity: typeof import("../lib/fen-consequence-similarity") = require("../lib/fen-consequence-similarity.ts");

const {
  antiDuplicateDelta,
  compareFens,
  extractFenConsequenceFingerprint,
} = fenSimilarity;

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("extractFenConsequenceFingerprint returns stable token and pressure features", () => {
  const fingerprint = extractFenConsequenceFingerprint(START_FEN);

  assert.equal(fingerprint.vectors.whiteAttacks.length, 64);
  assert.equal(fingerprint.vectors.blackAttacks.length, 64);
  assert.equal(fingerprint.vectors.contested.length, 64);
  assert.equal(fingerprint.vectors.kingZoneAttacks.length, 128);
  assert.equal(fingerprint.vectors.saliencePressure.length, 128);
  assert.ok(fingerprint.tokens["king:white:uncastled"] > 0);
  assert.ok(fingerprint.tokens["king:black:uncastled"] > 0);
  assert.ok((fingerprint.numeric["material.w.total"] ?? 0) > 0);
  assert.ok((fingerprint.numeric["phase.scalar"] ?? 0) > 0.9);
});

test("pinned and hanging pieces are emitted as sparse consequence tokens", () => {
  const pinned = extractFenConsequenceFingerprint("k3r3/8/8/8/8/8/4N3/4K3 w - - 0 1");
  const pinnedTokens = Object.keys(pinned.tokens);
  assert.ok(pinnedTokens.some((token) => token.startsWith("pinned:wn:by:br")));

  const hanging = extractFenConsequenceFingerprint("k7/8/8/8/4q3/8/8/4R1K1 w - - 0 1");
  const hangingTokens = Object.keys(hanging.tokens);
  assert.ok(hangingTokens.some((token) => token.startsWith("hanging:bq")));
});

test("compareFens scores identical positions at one", () => {
  const comparison = compareFens(START_FEN, START_FEN);

  assert.equal(comparison.score, 1);
  assert.equal(comparison.tokenScore, 1);
  assert.equal(comparison.pressureScore, 1);
});

test("an irrelevant pawn push is closer than a material change", () => {
  const chess = new Chess(START_FEN);
  chess.move("h3");
  const quietPawnPushFen = chess.fen();
  const missingRooksFen = "1nbqkbn1/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBN1 b - - 0 1";

  const quietScore = compareFens(START_FEN, quietPawnPushFen).score;
  const materialScore = compareFens(START_FEN, missingRooksFen).score;

  assert.ok(quietScore > 0.7);
  assert.ok(quietScore > materialScore);
});

test("antiDuplicateDelta rejects candidates below the configurable delta threshold", () => {
  const chess = new Chess(START_FEN);
  chess.move("h3");
  const candidateFen = chess.fen();

  const result = antiDuplicateDelta(candidateFen, [START_FEN], { threshold: 0.5 });

  assert.ok(result.reject);
  assert.ok(result.delta < 0.5);
  assert.equal(result.mostSimilarIndex, 0);
});

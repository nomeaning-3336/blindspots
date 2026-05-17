import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("postmortem add-position rollback keeps board piece animation enabled", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  assert.match(
    source,
    /const shouldAnimateBoardPieces =\s*shouldAnimatePieces && \(!postmortemOnboardingActive \|\| rollbackAnimating\);/,
  );
  assert.doesNotMatch(source, /pieceAnimation=\{shouldAnimatePieces && !postmortemOnboardingActive\}/);
  assert.match(source, /pieceAnimation=\{shouldAnimateBoardPieces\}/);
});

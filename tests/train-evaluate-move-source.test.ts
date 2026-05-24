import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync("app/api/train/evaluate-move/route.ts", "utf8");

test("evaluate-move scores legal-line candidates from the same root search", () => {
  assert.match(
    source,
    /const LEGAL_LINE_DEPTH_LIMIT = 18;/,
    "Legal-line mistake scoring must use a stable fixed-depth root search",
  );
  assert.match(
    source,
    /getPositionLines\(decisionFen, \{[\s\S]*depthLimit: LEGAL_LINE_DEPTH_LIMIT,[\s\S]*multiPv: 1,[\s\S]*\}\)/,
    "Legal-line scoring must get the best root line with a focused fixed-depth search",
  );
  assert.match(
    source,
    /getForcedMoveLine\(decisionFen, uci, \{[\s\S]*depthLimit: LEGAL_LINE_DEPTH_LIMIT,[\s\S]*\}\)/,
    "Legal-line scoring must evaluate the played move as a focused forced root line",
  );
  assert.match(
    source,
    /const comparableEvalAfter = comparableEval\(candidateLine, decisionFen\);/,
    "CPL must compare the best legal root line with the candidate legal root line, not a separate after-move eval",
  );
  assert.doesNotMatch(
    source,
    /const comparableEvalAfter = userColor === "w" \? displayEvalAfter : -displayEvalAfter;/,
  );
});

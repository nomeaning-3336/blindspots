import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync("components/position-thumbnail.tsx", "utf8");

test("replay thumbnail uses the queue overview piece glide timing", () => {
  assert.match(source, /const PIECE_GLIDE_MS = 240;/);
  assert.match(source, /pieceAnimationDurationMs=\{PIECE_GLIDE_MS\}/);
});

test("replay thumbnail hover scale is subtle", () => {
  assert.match(source, /duration-500/);
  assert.match(source, /ease-\[cubic-bezier\(0\.22,1,0\.36,1\)\]/);
  assert.match(source, /hover:scale-\[1\.002\]/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("board snapshot capstone clones board, animates to target, and honors reduced motion", () => {
  const source = readFileSync("components/train/board-snapshot.tsx", "utf8");

  assert.match(source, /export async function playBoardSnapshotToButton/);
  assert.match(source, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(source, /boardEl\.cloneNode\(true\)/);
  assert.match(source, /data-board-snapshot-clone/);
  assert.match(source, /data-board-snapshot-flash/);
  assert.match(source, /prepareSnapshotAudio/);
  assert.match(source, /await prepareSnapshotAudio\(\)\.catch\(\(\) => \{\}\)/);
  assert.match(source, /playSnapshotShutterSound\(\)/);
  assert.doesNotMatch(source, /new Audio\(/);
  assert.match(source, /wrapper\.animate\(/);
  assert.match(source, /cubic-bezier\(0\.55, -0\.05, 0\.85, 0\.4\)/);
  assert.match(source, /train-add-position-chest-absorb/);
});

test("analysis board exposes a snapshot root", () => {
  const source = readFileSync("components/chess/analysis-board.tsx", "utf8");

  assert.match(source, /data-snapshot-board/);
});

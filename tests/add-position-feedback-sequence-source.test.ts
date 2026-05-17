import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const trainClientSource = () => readFileSync("app/(shell)/train/train-client.tsx", "utf8");

test("add position uses rewind, forward replay, snapshot capstone, then save", () => {
  const source = trainClientSource();

  assert.match(source, /const REVERSE_GLIDE_MS = 500;/);
  assert.match(source, /const FORWARD_GLIDE_MS = 240;/);
  assert.match(source, /const STEP_GAP_MS = 40;/);
  assert.match(source, /async function runAddPositionFeedback\(snapshot: LearningQueueTarget\)/);
  assert.match(source, /await runReversePreludeLeg\(snapshot\);/);
  assert.match(source, /await runForwardPreludeLeg\(snapshot\);/);
  assert.match(source, /await playBoardSnapshotToButton\(/);
  assert.match(source, /void addPositionToLearningQueue\(snapshot\);/);
  assert.ok(!source.includes("}, 660);"));
});

test("add position feedback respects reduced motion and blocks navigation while running", () => {
  const source = trainClientSource();

  assert.match(source, /prefersReducedMotion\(\)/);
  assert.match(source, /if \(rollbackAnimating\) return;/);
  assert.match(source, /disabled=\{[\s\S]*rollbackAnimating[\s\S]*\}/);
  assert.match(source, /data-snapshot-target/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("training audio is limited to move, capture, and snapshot shutter sounds", () => {
  const audioSource = readFileSync("lib/train-audio.ts", "utf8");
  const trainClientSource = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  assert.match(audioSource, /export type TrainSoundName = "move" \| "capture" \| "shutter";/);
  assert.match(audioSource, /move: "\/analyze\/sounds\/move-self\.mp3"/);
  assert.match(audioSource, /capture: "\/analyze\/sounds\/capture\.mp3"/);
  assert.match(audioSource, /shutter: "\/analyze\/sounds\/shutter\.wav"/);
  assert.doesNotMatch(audioSource, /playTrainUiSound/);
  assert.doesNotMatch(audioSource, /uiClick|addPositionConfirm|ui-click|add-position-confirm/);
  assert.doesNotMatch(trainClientSource, /playTrainUiSound|playUiClick|onUiClick|addPositionConfirm|uiClick/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("training audio is limited to piece move and capture sounds", () => {
  const audioSource = readFileSync("lib/train-audio.ts", "utf8");
  const trainClientSource = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  assert.match(audioSource, /export type TrainSoundName = "move" \| "capture";/);
  assert.match(audioSource, /move: "\/analyze\/sounds\/move-self\.mp3"/);
  assert.match(audioSource, /capture: "\/analyze\/sounds\/capture\.mp3"/);
  assert.doesNotMatch(audioSource, /playTrainUiSound/);
  assert.doesNotMatch(audioSource, /uiClick|addPositionConfirm|ui-click|add-position-confirm/);
  assert.doesNotMatch(trainClientSource, /playTrainUiSound|playUiClick|onUiClick|addPositionConfirm|uiClick/);
});

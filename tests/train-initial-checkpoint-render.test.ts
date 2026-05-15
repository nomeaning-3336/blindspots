import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const pageSource = readFileSync("app/(shell)/train/page.tsx", "utf8");
const clientSource = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

test("train page passes the persisted tour checkpoint into the initial client render", () => {
  assert.match(pageSource, /initialTrainingTourCheckpoint=\{state\.trainingTourCheckpoint\}/);
  assert.match(clientSource, /initialTrainingTourCheckpoint\?: TrainingTourCheckpointPayload \| null/);
});

test("tour and checkpoint loads skip the transient onboarding loading screen", () => {
  assert.match(
    clientSource,
    /useState<OnboardingScreen>\(\s*shouldRunPreplayOnboarding \? "done" : "loading",\s*\)/,
  );
});

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const transition: typeof import("../lib/train-onboarding-transition") = require("../lib/train-onboarding-transition.ts");

const { runStartTrainingTransition } = transition;

test("enters the training surface before waiting for onboarding persistence", async () => {
  const events: string[] = [];
  let resolvePersistOnboarding!: () => void;
  const persistOnboarding = new Promise<void>((resolve) => {
    resolvePersistOnboarding = resolve;
  });
  let resolveSaveSettings!: () => void;
  const saveSettings = new Promise<void>((resolve) => {
    resolveSaveSettings = resolve;
  });

  const transitionPromise = runStartTrainingTransition({
    enterTrainingSurface() {
      events.push("enter-training");
    },
    persistOnboarding() {
      events.push("persist-onboarding");
      return persistOnboarding;
    },
    saveSettings() {
      events.push("save-settings");
      return saveSettings;
    },
    loadPosition() {
      events.push("load-position");
      return Promise.resolve();
    },
  });

  assert.deepEqual(events, ["enter-training", "persist-onboarding"]);

  resolvePersistOnboarding();
  await Promise.resolve();
  assert.deepEqual(events, ["enter-training", "persist-onboarding", "save-settings"]);

  resolveSaveSettings();
  await transitionPromise;

  assert.deepEqual(events, ["enter-training", "persist-onboarding", "save-settings", "load-position"]);
});

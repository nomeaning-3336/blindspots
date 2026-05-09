import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const defaults: typeof import("../lib/training/default-profile") = require("../lib/training/default-profile.ts");

const { buildDefaultBlindspotProfile, shouldShowTrainingOnboarding } = defaults;

test("default training profile is ready for signed-in users without external accounts", () => {
  const profile = buildDefaultBlindspotProfile("user-1");

  assert.equal(profile.user_id, "user-1");
  assert.equal(profile.blindspots_elo, 1200);
  assert.equal(profile.rating_deviation, 650);
  assert.equal(profile.initial_skill_level, "beginner");
  assert.equal(profile.profile_initialized, true);
  assert.equal(profile.initialization_status, "complete");
  assert.deepEqual(profile.exploit_queue, []);
  assert.deepEqual(profile.explore_queue, []);
  assert.deepEqual(profile.revisit_queue, []);
  assert.deepEqual(profile.mastered_queue, []);
});

test("training onboarding is no longer shown for missing or default profiles", () => {
  assert.equal(shouldShowTrainingOnboarding(null), false);
  assert.equal(shouldShowTrainingOnboarding(buildDefaultBlindspotProfile("user-1")), false);
  assert.equal(
    shouldShowTrainingOnboarding({
      profile_initialized: false,
      initialization_status: "pending",
    }),
    false,
  );
});

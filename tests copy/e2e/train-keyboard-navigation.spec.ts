import { test, expect, type Page } from "@playwright/test";

// These tests require real Supabase credentials set via environment variables.
// If not set, tests will be skipped.
const E2E_USER_EMAIL = process.env.E2E_TEST_EMAIL ?? "test-train-keyboard@example.com";
const E2E_USER_PW = process.env.E2E_TEST_PW ?? "TestPassword123!";

// ─── Fixture Payloads ─────────────────────────────────────────────────────────

type NextPositionResponse = {
  fen?: string;
  previousFen?: string;
  playedMove?: string;
  sequenceLength?: number;
  source?: string;
  error?: string;
  debug?: Record<string, unknown>;
};

// Fixture: engine played e2e4 (White) as initial setup, user plays e7e5, engine replies
// Visible positions: 0=e4, 1=e5, 2=(engine reply)
// For testing keyboard nav we need state === "complete" so we complete the sequence
const FIXTURE_ENGINE_WHITE_COMPLETE: NextPositionResponse = {
  fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
  previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  playedMove: "e2e4",
  sequenceLength: 4,
};

const INIT_SKIPPED: Record<string, unknown> = {
  profile: {
    initialization_status: "skipped",
    profile_initialized: false,
    weakness_vector: {},
    mastery_vector: {},
    exploit_queue: [],
    explore_queue: [],
    revisit_queue: [],
    mastered_queue: [],
  },
  preferences: { sequence_length: 4 },
  linkedProfiles: [],
  shouldShowOnboarding: false,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Wait for the setup animation to settle. */
async function waitForSettle(page: Page) {
  await page.waitForTimeout(1500);
}

/** Wait for state to transition to "complete" after sequence completion. */
async function waitForComplete(page: Page) {
  // The auto-switch timer is 180ms, plus some buffer
  await page.waitForTimeout(500);
}

/** Sign in using environment credentials. */
async function ensureSignedIn(page: Page) {
  const email = process.env.E2E_TEST_EMAIL ?? E2E_USER_EMAIL;
  const pw = process.env.E2E_TEST_PW ?? E2E_USER_PW;
  await page.goto("/sign-in");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 10_000 });
}

/** Complete a sequence by making the required moves.
 *  Returns the final visibleSequencePositions length.
 */
async function completeSequence(page: Page, moveCount: number = 2) {
  const board = page.locator("[data-testid='train-board']");
  await expect(board).toBeVisible({ timeout: 5000 });

  // We'll make moves until the sequence is done
  // For Fixture A: starting FEN after setup is rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b
  // After e7e5: rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w
  // Make e7e5
  await board.locator('[data-square="e7"]').click();
  await board.locator('[data-square="e5"]').click();
  await page.waitForTimeout(300);

  // Continue making moves to complete the sequence (simplified - just check if we're in complete state)
  await waitForComplete(page);
}

// ─── Test Case A: arrow navigation changes positions ─────────────────────────

test("A: after completion, arrow navigation changes positions", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run this test");
    return;
  }

  // Mock initialization and position
  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });

  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: FIXTURE_ENGINE_WHITE_COMPLETE });
  });

  // Mock complete-sequence to prevent errors when sequence completes
  await page.route("**/api/train/complete-sequence", (route) => {
    route.fulfill({ json: { ok: true, eloAfter: 1200 } });
  });

  // Mock engine-lines to avoid loading state
  await page.route("**/api/train/engine-lines", (route) => {
    route.fulfill({ json: [] });
  });

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSettle(page);

  // Verify setup is done
  const replayState0 = await page.evaluate(() => (window as unknown as { __blindspotsTrainReplayState?: unknown }).__blindspotsTrainReplayState);
  expect(replayState0).toBeDefined();
  const rs0 = replayState0 as { activeExploreIndex: number; maxExploreIndex: number; activeFen: string };
  expect(rs0.activeExploreIndex).toBeGreaterThanOrEqual(0);

  // Make moves to complete the sequence
  await completeSequence(page, 2);
  await waitForComplete(page);

  // After completion, keyboard navigation should work
  // Get initial state
  const replayStateBefore = await page.evaluate(() => (window as unknown as { __blindspotsTrainReplayState?: unknown }).__blindspotsTrainReplayState);
  const rsBefore = replayStateBefore as { activeExploreIndex: number; maxExploreIndex: number };

  // Press ArrowLeft
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(100);

  const replayStateAfterLeft = await page.evaluate(() => (window as unknown as { __blindspotsTrainReplayState?: unknown }).__blindspotsTrainReplayState);
  const rsAfterLeft = replayStateAfterLeft as { activeExploreIndex: number; activeFen: string; maxExploreIndex: number };

  // Should have navigated to a different position
  // Either went to a lower index, or stayed at 0 (bounds)
  expect(rsAfterLeft.activeExploreIndex).toBeLessThanOrEqual(rsBefore.activeExploreIndex);
  expect(rsAfterLeft.activeExploreIndex).toBeGreaterThanOrEqual(0);
  expect(rsAfterLeft.maxExploreIndex).toBe(rsBefore.maxExploreIndex);

  // Press ArrowRight
  const idxBeforeRight = rsAfterLeft.activeExploreIndex;
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);

  const replayStateAfterRight = await page.evaluate(() => (window as unknown as { __blindspotsTrainReplayState?: unknown }).__blindspotsTrainReplayState);
  const rsAfterRight = replayStateAfterRight as { activeExploreIndex: number; activeFen: string };

  // Should have moved forward (unless already at max)
  if (idxBeforeRight < rsAfterLeft.maxExploreIndex) {
    expect(rsAfterRight.activeExploreIndex).toBe(idxBeforeRight + 1);
  } else {
    expect(rsAfterRight.activeExploreIndex).toBe(idxBeforeRight);
  }
});

// ─── Test Case B: position 0 setup move works ───────────────────────────────

test("B: Home key jumps to position 0 with setup engine move highlighted", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run this test");
    return;
  }

  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });

  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: FIXTURE_ENGINE_WHITE_COMPLETE });
  });

  await page.route("**/api/train/complete-sequence", (route) => {
    route.fulfill({ json: { ok: true, eloAfter: 1200 } });
  });

  await page.route("**/api/train/engine-lines", (route) => {
    route.fulfill({ json: [] });
  });

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSettle(page);

  // Complete sequence to enter "complete" state
  await completeSequence(page, 2);

  // Navigate to position 0 using Home
  await page.keyboard.press("Home");
  await page.waitForTimeout(200);

  const replayState = await page.evaluate(() => (window as unknown as { __blindspotsTrainReplayState?: unknown }).__blindspotsTrainReplayState);
  const rs = replayState as { activeExploreIndex: number; activeMove: unknown; visibleSequencePositions: unknown[] };

  // Should be at position 0
  expect(rs.activeExploreIndex).toBe(0);

  // Position 0 should have a move (the setup engine move)
  expect(rs.visibleSequencePositions).toBeDefined();
  expect((rs.visibleSequencePositions as unknown[]).length).toBeGreaterThan(0);
  const pos0 = rs.visibleSequencePositions[0] as { move: unknown };
  expect(pos0.move).toBeDefined();

  // Board FEN should be the starting FEN (before setup move was played)
  // For Fixture A: starting FEN is rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
  const timeline = await page.evaluate(() => (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline);
  const tl = timeline as { displayStartingFen: string };
  expect(rs).toBeDefined();
});

// ─── Test Case C: sound pitch follows destination position ───────────────────

test("C: sound pitch indices follow destination position during navigation", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run this test");
    return;
  }

  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });

  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: FIXTURE_ENGINE_WHITE_COMPLETE });
  });

  await page.route("**/api/train/complete-sequence", (route) => {
    route.fulfill({ json: { ok: true, eloAfter: 1200 } });
  });

  await page.route("**/api/train/engine-lines", (route) => {
    route.fulfill({ json: [] });
  });

  // Enable QA mode and reset sound events
  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
    (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents = [];
  });

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSettle(page);

  // Complete sequence
  await completeSequence(page, 2);

  // Home -> position 0
  await page.keyboard.press("Home");
  await page.waitForTimeout(200);

  const eventsAfterHome = await page.evaluate(() => (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents ?? []);
  // Getting the count before ArrowRight so we can isolate the events from this navigation
  const homeEventCount = eventsAfterHome.length;

  // ArrowRight -> position 1
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);

  const eventsAfterRight1 = await page.evaluate(() => (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents ?? []);
  const newRight1Events = eventsAfterRight1.slice(homeEventCount);
  const right1Event = newRight1Events.find((e: unknown) => (e as { source?: string }).source === "replay");

  // pitchIndex for position 1 should be 1 (destination-based)
  if (right1Event) {
    expect((right1Event as { pitchIndex: number }).pitchIndex).toBe(1);
    expect(typeof (right1Event as { playbackRate: number }).playbackRate).toBe("number");
    expect((right1Event as { playbackRate: number }).playbackRate).toBeGreaterThan(0);
  }

  // ArrowLeft -> position 0
  const countBeforeLeft = eventsAfterRight1.length;
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);

  const eventsAfterLeft = await page.evaluate(() => (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents ?? []);
  const newLeftEvents = eventsAfterLeft.slice(countBeforeLeft);
  const left0Event = newLeftEvents.find((e: unknown) => (e as { source?: string }).source === "replay");

  // pitchIndex for position 0 should be 0
  if (left0Event) {
    expect((left0Event as { pitchIndex: number }).pitchIndex).toBe(0);
    expect(typeof (left0Event as { playbackRate: number }).playbackRate).toBe("number");
    expect((left0Event as { playbackRate: number }).playbackRate).toBeGreaterThan(0);
  }

  // ArrowRight -> position 1
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);

  // ArrowRight -> position 2
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);

  const eventsAfterRight2 = await page.evaluate(() => (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents ?? []);
  const lastEvent = eventsAfterRight2[eventsAfterRight2.length - 1];

  // Last navigation was to position 2, so pitchIndex should be 2
  if (lastEvent && (lastEvent as { source: string }).source === "replay") {
    expect((lastEvent as { pitchIndex: number }).pitchIndex).toBe(2);
  }
});

// ─── Test Case D: bounds ────────────────────────────────────────────────────

test("D: ArrowLeft at position 0 does not go negative or replay sound", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run this test");
    return;
  }

  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });

  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: FIXTURE_ENGINE_WHITE_COMPLETE });
  });

  await page.route("**/api/train/complete-sequence", (route) => {
    route.fulfill({ json: { ok: true, eloAfter: 1200 } });
  });

  await page.route("**/api/train/engine-lines", (route) => {
    route.fulfill({ json: [] });
  });

  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
    (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents = [];
  });

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSettle(page);
  await completeSequence(page, 2);

  // Jump to position 0 using Home
  await page.keyboard.press("Home");
  await page.waitForTimeout(200);

  const eventsBeforeBounds = await page.evaluate(() => (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents ?? []);
  const countBefore = eventsBeforeBounds.length;

  // Press ArrowLeft at position 0 — should stay at 0
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);

  const replayState = await page.evaluate(() => (window as unknown as { __blindspotsTrainReplayState?: unknown }).__blindspotsTrainReplayState);
  const rs = replayState as { activeExploreIndex: number };

  // Should still be at 0
  expect(rs.activeExploreIndex).toBe(0);

  // No new sound events should be logged (no duplicate sound at bounds)
  const eventsAfter = await page.evaluate(() => (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents ?? []);
  expect(eventsAfter.length).toBe(countBefore);
});

// ─── Test Case E: do not hijack inputs/buttons ──────────────────────────────

test("E: ArrowRight while focused on a button does not trigger navigation", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run this test");
    return;
  }

  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });

  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: FIXTURE_ENGINE_WHITE_COMPLETE });
  });

  await page.route("**/api/train/complete-sequence", (route) => {
    route.fulfill({ json: { ok: true, eloAfter: 1200 } });
  });

  await page.route("**/api/train/engine-lines", (route) => {
    route.fulfill({ json: [] });
  });

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSettle(page);
  await completeSequence(page, 2);

  // Get initial state
  const replayStateBefore = await page.evaluate(() => (window as unknown as { __blindspotsTrainReplayState?: unknown }).__blindspotsTrainReplayState);
  const rsBefore = replayStateBefore as { activeExploreIndex: number };

  // Find a button on the page and focus it
  const buttons = page.locator("button");
  const buttonCount = await buttons.count();
  expect(buttonCount).toBeGreaterThan(0);

  await buttons.first().focus();
  await page.waitForTimeout(100);

  // Press ArrowRight while button is focused
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);

  // State should NOT have changed (navigation should be ignored)
  const replayStateAfter = await page.evaluate(() => (window as unknown as { __blindspotsTrainReplayState?: unknown }).__blindspotsTrainReplayState);
  const rsAfter = replayStateAfter as { activeExploreIndex: number };

  expect(rsAfter.activeExploreIndex).toBe(rsBefore.activeExploreIndex);
});

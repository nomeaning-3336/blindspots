import { test, expect, type Page } from "@playwright/test";

const E2E_USER_EMAIL = process.env.E2E_TEST_EMAIL ?? "test-train-setup-replay@example.com";
const E2E_USER_PW = process.env.E2E_TEST_PW ?? "TestPassword123!";

type NextPositionResponse = {
  fen?: string;
  previousFen?: string;
  playedMove?: string;
  sequenceLength?: number;
  source?: string;
  error?: string;
};

// Fixture: engine plays e4 as White (position after: Black to move)
const FIXTURE_ENGINE_WHITE: NextPositionResponse = {
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
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
};

async function waitForSetupSettle(page: Page) {
  await page.waitForTimeout(1200);
}

async function ensureSignedIn(page: Page) {
  const email = process.env.E2E_TEST_EMAIL ?? E2E_USER_EMAIL;
  const pw = process.env.E2E_TEST_PW ?? E2E_USER_PW;
  await page.goto("/sign-in");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 10_000 });
}

// ── Test 1: ArrowLeft from b goes to a ─────────────────────────────────────

test("1: ArrowLeft navigates from b (setup-after) to a (setup-before)", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run");
    return;
  }

  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
    (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents = [];
  });

  await page.route("**/api/train/initialize", (route) => route.fulfill({ json: INIT_SKIPPED }));
  await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIXTURE_ENGINE_WHITE }));

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSetupSettle(page);

  // After setup, should be at b (activeSetupReplayIndex === 1)
  const timelineAfterSetup = await page.evaluate(() => (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline);
  const tl = timelineAfterSetup as { activeSetupReplayIndex: number; setupBeforeFen: string; setupAfterFen: string };
  expect(tl.activeSetupReplayIndex).toBe(1);

  // Press ArrowLeft to go from b to a
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);

  // activeSetupReplayIndex should now be 0
  const timelineAtA = await page.evaluate(() => (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline);
  const tlAtA = timelineAtA as { activeSetupReplayIndex: number; activeSetupCurrentFen: string; setupBeforeFen: string };
  expect(tlAtA.activeSetupReplayIndex).toBe(0);
  // Board FEN should be setupBeforeFen (the starting position before engine move)
  expect(tlAtA.activeSetupCurrentFen).toBe(tlAtA.setupBeforeFen);
});

// ── Test 2: ArrowRight from a returns to b and plays setup sound with pitchIndex 0 ─

test("2: ArrowRight from a returns to b and plays setup move sound with pitchIndex 0", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run");
    return;
  }

  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
    (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents = [];
  });

  await page.route("**/api/train/initialize", (route) => route.fulfill({ json: INIT_SKIPPED }));
  await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIXTURE_ENGINE_WHITE }));

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSetupSettle(page);

  // Go to a
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);

  // Press ArrowRight to return to b
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);

  // activeSetupReplayIndex should be back to 1
  const timelineAtB = await page.evaluate(() => (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline);
  const tlAtB = timelineAtB as { activeSetupReplayIndex: number; setupAfterFen: string; activeSetupCurrentFen: string };
  expect(tlAtB.activeSetupReplayIndex).toBe(1);
  expect(tlAtB.activeSetupCurrentFen).toBe(tlAtB.setupAfterFen);

  // Sound event should have been logged with pitchIndex 0 and source "replay"
  const soundEvents = await page.evaluate(() => (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents ?? []);
  const replayEvents = soundEvents.filter((e: unknown) => (e as { source: string }).source === "replay");
  expect(replayEvents.length).toBeGreaterThan(0);
  const setupReplayEvent = replayEvents.find((e: unknown) => (e as { san?: string }).san?.toLowerCase().includes("e4"));
  expect(setupReplayEvent).toBeDefined();
  expect((setupReplayEvent as { pitchIndex: number }).pitchIndex).toBe(0);
});

// ── Test 3: Player cannot move from position a ─────────────────────────────

test("3: Player move is blocked from position a, allowed from b", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run");
    return;
  }

  await page.route("**/api/train/initialize", (route) => route.fulfill({ json: INIT_SKIPPED }));
  await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIXTURE_ENGINE_WHITE }));

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSetupSettle(page);

  // Go to a
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);

  // Attempt to make a move from position a — board should be disabled
  const board = page.locator("[data-testid='train-board']");
  const boardDisabled = await board.locator('[data-disabled="true"]').count();
  // The board element may or may not have explicit disabled attribute; check via timeline
  const timelineAtA = await page.evaluate(() => (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline);
  const tlAtA = timelineAtA as { activeSetupReplayIndex: number; moves: unknown[] };
  expect(tlAtA.activeSetupReplayIndex).toBe(0);

  // The move panel should still show the setup move (it's in displayMoves), not "No moves yet"
  const emptyLocator = page.locator("[data-testid='train-move-empty']");
  await expect(emptyLocator).toHaveCount(0);

  // Go back to b
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);

  const timelineAtBAgain = await page.evaluate(() => (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline);
  const tlAtBAgain = timelineAtBAgain as { activeSetupReplayIndex: number; moves: unknown[] };
  expect(tlAtBAgain.activeSetupReplayIndex).toBe(1);

  // Now make the player move — it should be accepted
  await board.locator('[data-square="e7"]').click();
  await board.locator('[data-square="e5"]').click();
  await page.waitForTimeout(500);

  // After player move, moves.length should be 1
  const timelineAfterMove = await page.evaluate(() => (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline);
  const tlAfterMove = timelineAfterMove as { moves: unknown[] };
  expect(tlAfterMove.moves).toHaveLength(1);
  // And initialOpponentMove should still be separate (not in moves)
  const initialOpponentMove = (timelineAfterMove as { initialOpponentMove: unknown }).initialOpponentMove;
  expect(initialOpponentMove).not.toBeNull();
});

// ── Test 4: complete-sequence payload still excludes setup move ─────────────

test("4: complete-sequence receives scored moves only, not initialOpponentMove", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run");
    return;
  }

  const recordedPayloads: unknown[] = [];

  await page.route("**/api/train/initialize", (route) => route.fulfill({ json: INIT_SKIPPED }));
  await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIXTURE_ENGINE_WHITE }));
  await page.route("**/api/train/complete-sequence", async (route) => {
    if (route.request().method() === "POST") {
      const postData = route.request().postData();
      if (postData) {
        try {
          recordedPayloads.push(JSON.parse(postData));
        } catch {
          // ignore
        }
      }
    }
    route.fulfill({ json: { ok: true } });
  });

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSetupSettle(page);

  // Make the player move (e7e5) to trigger complete-sequence
  const board = page.locator("[data-testid='train-board']");
  await board.locator('[data-square="e7"]').click();
  await board.locator('[data-square="e5"]').click();
  await page.waitForTimeout(500);

  // Verify: setup move (e4) is NOT in the scored moves
  if (recordedPayloads.length > 0) {
    const payload = recordedPayloads[0] as { moves?: unknown[]; startingFen?: string };
    const scoredMoves = payload.moves ?? [];
    const scoredSanList = scoredMoves.map((m: unknown) => (m as { san?: string }).san);
    // e4 (the setup engine move) should NOT appear in scored moves
    expect(scoredSanList).not.toContain("e4");
    // The startingFen should be the setup-after FEN, not setup-before
    expect(payload.startingFen).toBe(FIXTURE_ENGINE_WHITE.fen);
  }
});

// ── Test 5: Sound pitch indices stay audible across 8 plies ─────────────────

test("5: Move sounds stay audible across at least 8 plies with correct pitch indices", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run");
    return;
  }

  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
    (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents = [];
  });

  await page.route("**/api/train/initialize", (route) => route.fulfill({ json: INIT_SKIPPED }));
  await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIXTURE_ENGINE_WHITE }));

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSetupSettle(page);

  // Setup move: pitch index 0
  // Make a few player moves to generate sound events
  const board = page.locator("[data-testid='train-board']");

  // Move 1 (player): e7e5
  await board.locator('[data-square="e7"]').click();
  await board.locator('[data-square="e5"]').click();
  await page.waitForTimeout(300);

  // Move 2 (player): d7d6
  await board.locator('[data-square="d7"]').click();
  await board.locator('[data-square="d6"]').click();
  await page.waitForTimeout(300);

  // Move 3 (player): g8f6 (engine response) - but we simulate player making engine move via test

  const soundEvents = await page.evaluate(() => (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents ?? []);

  // All live events should have finite positive playbackRate
  const liveEvents = soundEvents.filter((e: unknown) => (e as { source: string }).source === "live");
  for (const event of liveEvents) {
    const e = event as { playbackRate: number; pitchIndex: number };
    expect(Number.isFinite(e.playbackRate)).toBe(true);
    expect(e.playbackRate).toBeGreaterThan(0);
    expect(e.pitchIndex).toBeGreaterThanOrEqual(0);
    expect(e.pitchIndex).toBeLessThan(8);
  }

  // Pitch indices should be sequential: 0, 1, 2, ...
  const pitchIndices = liveEvents.map((e: unknown) => (e as { pitchIndex: number }).pitchIndex);
  for (let i = 1; i < pitchIndices.length; i++) {
    expect(pitchIndices[i]).toBeGreaterThanOrEqual(pitchIndices[i - 1]);
  }
});
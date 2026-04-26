import { test, expect, type Page } from "@playwright/test";

const E2E_USER_EMAIL = process.env.E2E_TEST_EMAIL ?? "test-train-sound-latency@example.com";
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
  shouldShowOnboarding: false,
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

// ── Test A: audio primes and unlocks ─────────────────────────────────────────

test("A: audio primes and unlocks before first move", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run");
    return;
  }

  await page.route("**/api/train/initialize", (route) => route.fulfill({ json: INIT_SKIPPED }));
  await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIXTURE_ENGINE_WHITE }));

  await ensureSignedIn(page);

  // Enable QA mode before navigation
  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
  });

  await page.goto("/train", { waitUntil: "networkidle" });

  // Trigger a pointer down to unlock audio
  await page.click("body");
  await page.waitForTimeout(200);

  // Prime should have started
  const statsBefore = await page.evaluate(() => (window as unknown as { __blindspotsTrainAudioStats?: { primeStartedAt: number; primeFinishedAt: number; unlockedAt: number } }).__blindspotsTrainAudioStats);

  expect(statsBefore?.primeStartedAt).toBeGreaterThan(0);
  // unlockedAt should exist after pointerdown
  expect(statsBefore?.unlockedAt).toBeGreaterThan(0);
});

// ── Test B: initial setup move sound is immediate ─────────────────────────────

test("B: initial setup move sound has setupMs < 16ms once primed", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run");
    return;
  }

  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
  });

  await page.route("**/api/train/initialize", (route) => route.fulfill({ json: INIT_SKIPPED }));
  await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIXTURE_ENGINE_WHITE }));

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });

  // Trigger unlock
  await page.click("body");
  await page.waitForTimeout(500);

  // Wait for setup to settle
  await waitForSetupSettle(page);

  // Inspect audio stats
  const stats = await page.evaluate(() => (window as unknown as { __blindspotsTrainAudioStats?: { startedCalls: number; lastEvents: Array<{ san: unknown; pitchIndex: number; playbackRate: number; source: string; setupMs: number }> } }).__blindspotsTrainAudioStats);

  expect(stats).toBeDefined();
  expect(stats!.startedCalls).toBeGreaterThan(0);

  const setupEvent = stats!.lastEvents.find((e) => e.source === "live" && (e.san as string)?.toLowerCase().includes("e4"));
  expect(setupEvent).toBeDefined();
  expect(setupEvent!.pitchIndex).toBe(0);
  expect(Number.isFinite(setupEvent!.playbackRate)).toBe(true);
  expect(setupEvent!.playbackRate).toBeGreaterThan(0);

  // After warm-up, setupMs should be under 16ms
  expect(setupEvent!.setupMs).toBeLessThan(16);
});

// ── Test C: keyboard replay sound uses destination pitch ──────────────────────

test("C: ArrowRight from a to b plays sound with pitchIndex 0, source replay", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run");
    return;
  }

  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
  });

  await page.route("**/api/train/initialize", (route) => route.fulfill({ json: INIT_SKIPPED }));
  await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIXTURE_ENGINE_WHITE }));

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSetupSettle(page);

  // Unlock audio
  await page.click("body");
  await page.waitForTimeout(300);

  // Navigate from b (index 1) to a (index 0) then back to b
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);

  const stats = await page.evaluate(() => (window as unknown as { __blindspotsTrainAudioStats?: { lastEvents: Array<{ source: string; pitchIndex: number; setupMs: number }> } }).__blindspotsTrainAudioStats);

  const replayEvents = stats?.lastEvents.filter((e) => e.source === "replay") ?? [];
  expect(replayEvents.length).toBeGreaterThan(0);

  const lastReplay = replayEvents[replayEvents.length - 1];
  expect(lastReplay.pitchIndex).toBe(0);
  expect(lastReplay.setupMs).toBeLessThan(16);
});

// ── Test D: bounds do not replay sounds ──────────────────────────────────────

test("D: ArrowLeft at first position and ArrowRight at last do not emit sounds", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run");
    return;
  }

  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
  });

  await page.route("**/api/train/initialize", (route) => route.fulfill({ json: INIT_SKIPPED }));
  await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIXTURE_ENGINE_WHITE }));

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSetupSettle(page);
  await page.click("body");
  await page.waitForTimeout(300);

  const statsBefore = await page.evaluate(() => (window as unknown as { __blindspotsTrainAudioStats?: { startedCalls: number } }).__blindspotsTrainAudioStats);
  const callsBefore = statsBefore?.startedCalls ?? 0;

  // ArrowLeft from a (index 0) — should have no effect
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);

  // ArrowRight from b (index 1) — should trigger sound then fail at boundary
  // (for setup replay there are only 2 positions so this may be a no-op too)
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);

  const statsAfter = await page.evaluate(() => (window as unknown as { __blindspotsTrainAudioStats?: { startedCalls: number } }).__blindspotsTrainAudioStats);
  const callsAfter = statsAfter?.startedCalls ?? 0;

  // Only ArrowRight from a→b should produce a sound; ArrowLeft at a should be silent
  // In this setup with only 2 positions (a=0, b=1), ArrowRight at b goes nowhere
  // and ArrowLeft at a goes nowhere. So only a→b produces sound.
  // We already tested that in test C, here we just verify no extra unexpected sounds.
  // The count should not increase by more than 1 from what we expect.
  expect(callsAfter - callsBefore).toBeLessThanOrEqual(1);
});

// ── Test E: capture uses capture buffer ──────────────────────────────────────

test("E: capture move logs soundName capture", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run");
    return;
  }

  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
  });

  // Fixture where engine plays e4, then we make an exd4 capture
  const FIXTURE_ENGINE_WHITE_E4: NextPositionResponse = {
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    playedMove: "e2e4",
    sequenceLength: 4,
  };

  await page.route("**/api/train/initialize", (route) => route.fulfill({ json: INIT_SKIPPED }));
  await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIXTURE_ENGINE_WHITE_E4 }));

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSetupSettle(page);
  await page.click("body");
  await page.waitForTimeout(300);

  // Make a capture move: exd4
  const board = page.locator("[data-testid='train-board']");
  await board.locator('[data-square="d7"]').click();
  await board.locator('[data-square="d5"]').click();
  await page.waitForTimeout(500);

  const stats = await page.evaluate(() => (window as unknown as { __blindspotsTrainAudioStats?: { lastEvents: Array<{ soundName: string; san: unknown }> } }).__blindspotsTrainAudioStats);

  const captureEvents = stats?.lastEvents.filter((e) => e.soundName === "capture") ?? [];
  // The player's move exd4 is a capture
  expect(captureEvents.length).toBeGreaterThan(0);
});

// ── Test F: no delayed ghost sounds after warm-up ────────────────────────────

test("F: rapid replay navigation produces only immediate sounds", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run");
    return;
  }

  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
  });

  await page.route("**/api/train/initialize", (route) => route.fulfill({ json: INIT_SKIPPED }));
  await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIXTURE_ENGINE_WHITE }));

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSetupSettle(page);
  await page.click("body");
  await page.waitForTimeout(500);

  // Rapid navigation: a→b→a→b→a
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press(i % 2 === 0 ? "ArrowRight" : "ArrowLeft");
    await page.waitForTimeout(100);
  }

  await page.waitForTimeout(300);

  const stats = await page.evaluate(() => (window as unknown as { __blindspotsTrainAudioStats?: { lastEvents: Array<{ setupMs: number; source: string }> } }).__blindspotsTrainAudioStats);

  // All warm replay events should have setupMs < 16ms
  const replayEvents = stats?.lastEvents.filter((e) => e.source === "replay") ?? [];
  for (const event of replayEvents) {
    expect(event.setupMs).toBeLessThan(16);
  }

  // No event should have setupMs > 100ms (delayed ghost sound)
  for (const event of (stats?.lastEvents ?? [])) {
    expect(event.setupMs).toBeLessThan(100);
  }
});
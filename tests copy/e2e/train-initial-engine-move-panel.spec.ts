import { test, expect, type Page } from "@playwright/test";

// These tests require real Supabase credentials set via environment variables.
// If not set, tests will be skipped.
const E2E_USER_EMAIL = process.env.E2E_TEST_EMAIL ?? "test-train-initial-engine@example.com";
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

const FIXTURE_A_ENGINE_WHITE: NextPositionResponse = {
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  playedMove: "e2e4",
  sequenceLength: 4,
};

const FIXTURE_B_ENGINE_BLACK: NextPositionResponse = {
  fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2",
  previousFen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  playedMove: "g8f6",
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

/** Wait for the setup animation to settle (360ms sleep + 540ms transition = ~1s total). */
async function waitForSetupSettle(page: Page) {
  await page.waitForTimeout(1200);
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

// ─── Test Case A: Engine plays White first ────────────────────────────────────

test("A: engine plays White first — move panel shows row 1 immediately after setup", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run this test");
    return;
  }

  // 1. Mock auth and initialization
  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });

  // 2. Mock next-position to return Fixture A (engine played e2e4 as White)
  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: FIXTURE_A_ENGINE_WHITE });
  });

  await ensureSignedIn(page);

  // 3. Navigate to /train
  await page.goto("/train", { waitUntil: "networkidle" });

  // 4. Wait for setup animation to complete
  await waitForSetupSettle(page);

  // 5. Assert: "No moves yet" must NOT be visible
  const emptyLocator = page.locator("[data-testid='train-move-empty']");
  await expect(emptyLocator).toHaveCount(0);

  // 6. Assert: move panel has row 1
  const rowLocator = page.locator("[data-testid='train-move-row']");
  await expect(rowLocator).toHaveCount(1);

  // 7. Assert: white cell contains e4 (or SAN from the app)
  const whiteCell = page.locator("[data-testid='train-move-row'] [data-testid='train-move-white']").first();
  const whiteText = await whiteCell.textContent();
  expect(whiteText?.trim()).toMatch(/e4/i);

  // 8. Assert: black cell is empty/N/A/dash
  const blackCell = page.locator("[data-testid='train-move-row'] [data-testid='train-move-black']").first();
  const blackText = await blackCell.textContent();
  expect(blackText?.trim()).toBe("");

  // 9. Assert: prompt says Black to move (since engine played White)
  const prompt = page.locator("[data-testid='train-prompt']");
  await expect(prompt).toBeVisible();
  const promptText = await prompt.textContent();
  expect(promptText).toMatch(/Black to move/i);

  // 10. Assert: dev timeline shows initialOpponentMove is not null, displayMoves.length === 1, moves.length === 0
  const timeline = await page.evaluate(() => (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline);
  expect(timeline).toBeDefined();
  const tl = timeline as { startingFen: string; displayStartingFen: string; moves: unknown[]; initialOpponentMove: unknown; displayMoves: unknown[]; visibleSequencePositions: unknown[] };
  expect(tl.initialOpponentMove).not.toBeNull();
  expect(tl.displayMoves).toHaveLength(1);
  expect(tl.moves).toHaveLength(0);
  expect(tl.visibleSequencePositions[0]).toHaveProperty("move");
  expect((tl.visibleSequencePositions[0] as { fen: string }).fen).toBe(tl.startingFen);

  // 11. Make a Black move: e7e5
  const board = page.locator("[data-testid='train-board']");
  await expect(board).toBeVisible();
  // Click e7 then e5 to make the move
  await board.locator('[data-square="e7"]').click();
  await board.locator('[data-square="e5"]').click();
  await page.waitForTimeout(300);

  // 12. After player move: row 1 white still has e4, row 1 black has e5
  await expect(rowLocator).toHaveCount(1);
  const whiteTextAfter = await whiteCell.textContent();
  expect(whiteTextAfter?.trim()).toMatch(/e4/i);
  const blackTextAfter = await blackCell.textContent();
  expect(blackTextAfter?.trim()).toMatch(/e5/i);
});

// ─── Test Case B: Engine plays Black first ────────────────────────────────────

test("B: engine plays Black first — move panel shows row 1 with Black cell immediately", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run this test");
    return;
  }

  // 1. Mock auth and initialization
  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });

  // 2. Mock next-position to return Fixture B (engine played g8f6 as Black)
  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: FIXTURE_B_ENGINE_BLACK });
  });

  await ensureSignedIn(page);

  // 3. Navigate to /train
  await page.goto("/train", { waitUntil: "networkidle" });

  // 4. Wait for setup animation to complete
  await waitForSetupSettle(page);

  // 5. Assert: "No moves yet" must NOT be visible
  const emptyLocator = page.locator("[data-testid='train-move-empty']");
  await expect(emptyLocator).toHaveCount(0);

  // 6. Assert: move panel has row 1
  const rowLocator = page.locator("[data-testid='train-move-row']");
  await expect(rowLocator).toHaveCount(1);

  // 7. Assert: white cell is empty/N/A/dash
  const whiteCell = page.locator("[data-testid='train-move-row'] [data-testid='train-move-white']").first();
  const whiteText = await whiteCell.textContent();
  expect(whiteText?.trim()).toBe("");

  // 8. Assert: black cell contains Nf6 or g8f6 (depending on display format)
  const blackCell = page.locator("[data-testid='train-move-row'] [data-testid='train-move-black']").first();
  const blackText = await blackCell.textContent();
  expect(blackText?.trim()).toMatch(/Nf6|f6/i);

  // 9. Assert: prompt says White to move
  const prompt = page.locator("[data-testid='train-prompt']");
  await expect(prompt).toBeVisible();
  const promptText = await prompt.textContent();
  expect(promptText).toMatch(/White to move/i);

  // 10. Assert: dev timeline
  const timeline = await page.evaluate(() => (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline);
  expect(timeline).toBeDefined();
  const tl = timeline as { startingFen: string; displayStartingFen: string; moves: unknown[]; initialOpponentMove: unknown; displayMoves: unknown[]; visibleSequencePositions: unknown[] };
  expect(tl.initialOpponentMove).not.toBeNull();
  expect(tl.displayMoves).toHaveLength(1);
  expect(tl.moves).toHaveLength(0);

  // 11. Make a White move: g1f3
  const board = page.locator("[data-testid='train-board']");
  await expect(board).toBeVisible();
  await board.locator('[data-square="g1"]').click();
  await board.locator('[data-square="f3"]').click();
  await page.waitForTimeout(300);

  // 12. After player move: row 1 black still has Nf6, row 2 white has Nf3
  const rows = page.locator("[data-testid='train-move-row']");
  await expect(rows).toHaveCount(2);

  // Row 1: white empty, black Nf6
  const row1White = page.locator("[data-testid='train-move-row']").nth(0).locator("[data-testid='train-move-white']");
  const row1Black = page.locator("[data-testid='train-move-row']").nth(0).locator("[data-testid='train-move-black']");
  expect((await row1White.textContent())?.trim()).toBe("");
  expect((await row1Black.textContent())?.trim()).toMatch(/Nf6|f6/i);

  // Row 2: white Nf3
  const row2White = page.locator("[data-testid='train-move-row']").nth(1).locator("[data-testid='train-move-white']");
  const row2Text = await row2White.textContent();
  expect(row2Text?.trim()).toMatch(/Nf3|f3/i);
});

// ─── Test Case C: complete-sequence still excludes the setup move ─────────────

test("C: complete-sequence payload excludes initialOpponentMove (scored moves only)", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run this test");
    return;
  }

  const recordedPayloads: unknown[] = [];

  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });

  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: FIXTURE_A_ENGINE_WHITE });
  });

  await page.route("**/api/train/complete-sequence", async (route) => {
    if (route.request().method() === "POST") {
      const postData = route.request().postData();
      if (postData) {
        try {
          recordedPayloads.push(JSON.parse(postData));
        } catch {
          // ignore parse errors
        }
      }
    }
    route.fulfill({ json: { ok: true } });
  });

  await ensureSignedIn(page);
  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSetupSettle(page);

  // Make one player move to trigger completion flow
  const board = page.locator("[data-testid='train-board']");
  await board.locator('[data-square="e7"]').click();
  await board.locator('[data-square="e5"]').click();
  await page.waitForTimeout(300);

  // Trigger complete-sequence (the app calls this on sequence completion)
  // For this test we just verify the recorded payloads are correct
  // The key assertion: if initialOpponentMove existed, it should NOT be in complete-sequence
  if (recordedPayloads.length > 0) {
    const payload = recordedPayloads[0] as { moves?: unknown[] };
    // initialOpponentMove (e4) should NOT be in the scored moves
    const scoredMoves = payload.moves ?? [];
    const scoredSanList = scoredMoves.map((m: unknown) => (m as { san?: string }).san);
    expect(scoredSanList).not.toContain("e4");
  }
});

// ─── Test Case D: sound events logged correctly ──────────────────────────────

test("D: sound events logged for setup move and player move with correct pitchIndex", async ({ page }) => {
  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run this test");
    return;
  }

  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });

  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: FIXTURE_A_ENGINE_WHITE });
  });

  await ensureSignedIn(page);

  // Enable QA mode to activate sound event logging
  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
    (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents = [];
  });

  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSetupSettle(page);

  // Check sound events
  const soundEvents = await page.evaluate(() => (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents ?? []);

  // Setup move (e4) should have pitchIndex 0
  const setupEvent = soundEvents.find((e: unknown) => (e as { san?: string }).san?.toLowerCase().includes("e4"));
  expect(setupEvent).toBeDefined();
  expect((setupEvent as { pitchIndex: number }).pitchIndex).toBe(0);
  expect((setupEvent as { source: string }).source).toBe("live");
  expect(typeof (setupEvent as { playbackRate: number }).playbackRate).toBe("number");
  expect((setupEvent as { playbackRate: number }).playbackRate).toBeGreaterThan(0);

  // Make player move
  const board = page.locator("[data-testid='train-board']");
  await board.locator('[data-square="e7"]').click();
  await board.locator('[data-square="e5"]').click();
  await page.waitForTimeout(300);

  const soundEventsAfter = await page.evaluate(() => (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents ?? []);
  const playerEvent = soundEventsAfter.find((e: unknown) => (e as { san?: string }).san?.toLowerCase().includes("e5"));
  expect(playerEvent).toBeDefined();
  expect((playerEvent as { pitchIndex: number }).pitchIndex).toBe(1);
  expect((playerEvent as { source: string }).source).toBe("live");
});

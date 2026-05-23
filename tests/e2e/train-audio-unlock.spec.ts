import { test, expect, type Page } from "@playwright/test";

// ─── Shared helpers ────────────────────────────────────────────────────────────

async function ensureSignedIn(page: Page) {
  const email = process.env.E2E_TEST_EMAIL ?? "test@blindspots.app";
  const pw = process.env.E2E_TEST_PW ?? "password";
  await page.goto("/sign-in");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 10_000 });
}

type NextPositionResponse = {
  fen?: string;
  previousFen?: string;
  playedMove?: string;
  sequenceLength?: number;
  source?: string;
  error?: string;
  debug?: Record<string, unknown>;
};

/** Returns all sound events logged on the window. */
function getSoundEvents(page: Page) {
  return page.evaluate(() => {
    const win = window as unknown as {
      __blindspotsTrainSoundEvents?: Array<{ source?: string }>;
    };
    return win.__blindspotsTrainSoundEvents ?? [];
  });
}

/** Clears the sound event log. */
async function clearSoundEvents(page: Page) {
  await page.evaluate(() => {
    const win = window as unknown as {
      __blindspotsTrainSoundEvents?: Array<{ source?: string }>;
    };
    if (win.__blindspotsTrainSoundEvents) win.__blindspotsTrainSoundEvents.length = 0;
  });
}

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

const ENGINE_SETUP_PAYLOAD: NextPositionResponse = {
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  playedMove: "e2e4",
  sequenceLength: 4,
};

// ─── Test A: No placeholder flash while loading ─────────────────────────────────

test("A: no placeholder shown while loading a real position", async ({ page }) => {
  let resolveNextPosition: ((value: NextPositionResponse) => void) | null = null;
  const nextPositionPromise = new Promise<NextPositionResponse>((resolve) => {
    resolveNextPosition = resolve;
  });

  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });

  await page.route("**/api/train/next-position", async (route) => {
    // Keep the request pending to simulate network delay
    const payload = await nextPositionPromise;
    route.fulfill({ json: payload });
  });

  await ensureSignedIn(page);

  await page.goto("/train");
  await page.waitForTimeout(500);

  // While loading, no placeholder copy should be visible.
  await expect(page.locator("text=No position available")).not.toBeVisible();

  // Resolve the position
  resolveNextPosition!(ENGINE_SETUP_PAYLOAD);

  // Verify the overlay appears (since this is an engine-setup position)
  const overlay = page.locator("[data-testid='train-start-cta']");
  await expect(overlay).toBeVisible({ timeout: 5000 });
});

// ─── Test B: Overlay gates the initial engine move ───────────────────────────────

test("B: overlay appears, Space unlocks, board reaches fen, move table has engine move", async ({ page }) => {
  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });

  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: ENGINE_SETUP_PAYLOAD });
  });

  await ensureSignedIn(page);

  await page.goto("/train", { waitUntil: "networkidle" });

  // Board shows previousFen first (startpos, not the e4 position)
  const board = page.locator("[data-testid='train-board']");
  await expect(board).toBeVisible();

  // Overlay is visible
  const overlay = page.locator("[data-testid='train-start-cta']");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText(/start/i);

  // Move table is empty (engine move not yet in table)
  const moveRows = page.locator("[data-testid='train-move-row']");
  await expect(moveRows).toHaveCount(0);

  // Press Space to unlock
  await overlay.click();
  // Wait for setup animation to complete
  await page.waitForTimeout(1500);

  // Overlay is gone
  await expect(overlay).not.toBeVisible();

  // Board has reached the final fen (e4 position)
  // lastMove highlight should exist — check via the board data attribute
  // The last move highlight is set after the engine move plays
  const lastMoveHighlight = await page.evaluate(() => {
    // The board renders highlighted squares via the AnalysisBoard component
    // We verify indirectly: after setup, there should be a move row
    const rows = document.querySelectorAll("[data-testid='train-move-row']");
    return rows.length;
  });
  expect(lastMoveHighlight).toBeGreaterThanOrEqual(1);

  // Move row should show the engine's move (e4)
  const engineMoveCell = page.locator("[data-testid='train-move-row'] [data-testid='train-move-white']").first();
  const moveText = await engineMoveCell.textContent();
  expect(moveText?.trim()).toMatch(/e4/i);
});

// ─── Test C: Sound event logged only after gesture ───────────────────────────────

test("C: initial-engine sound event logged only after gesture, not before", async ({ page }) => {
  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });

  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: ENGINE_SETUP_PAYLOAD });
  });

  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
    (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents = [];
  });

  await clearSoundEvents(page);

  await page.goto("/train", { waitUntil: "networkidle" });

  // No initial-engine sound before gesture
  const eventsBefore = await getSoundEvents(page);
  const beforeCount = eventsBefore.filter((e) => e.source === "initial-engine").length;
  expect(beforeCount).toBe(0);

  // Press Space
  await page.locator("[data-testid='train-start-cta']").click();
  await page.waitForTimeout(1500);

  // Exactly one initial-engine sound after gesture
  const eventsAfter = await getSoundEvents(page);
  const afterCount = eventsAfter.filter((e) => e.source === "initial-engine").length;
  expect(afterCount).toBe(1);
});

// ─── Test D: ArrowLeft stays silent, ArrowRight plays sound ────────────────────

test("D: ArrowLeft after setup plays no sound; ArrowRight plays sound", async ({ page }) => {
  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });

  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: ENGINE_SETUP_PAYLOAD });
  });

  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
    (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents = [];
  });

  await clearSoundEvents(page);

  await page.goto("/train", { waitUntil: "networkidle" });

  // Unlock the setup
  await page.locator("[data-testid='train-start-cta']").click();
  await page.waitForTimeout(1500);

  const countAfterSetup = (await getSoundEvents(page)).length;

  // Press ArrowLeft — should NOT play sound
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(300);
  const countAfterLeft = (await getSoundEvents(page)).length;
  expect(countAfterLeft).toBe(countAfterSetup); // no new sound

  // Press ArrowRight — should play sound
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  const countAfterRight = (await getSoundEvents(page)).length;
  expect(countAfterRight).toBeGreaterThan(countAfterLeft);
});

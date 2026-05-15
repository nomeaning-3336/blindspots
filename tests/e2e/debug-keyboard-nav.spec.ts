import { test, expect, type Page } from "@playwright/test";

const E2E_USER_EMAIL = "test-user@example.com";
const E2E_USER_PW = "Password123!";

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

const FIXTURE_ENGINE_WHITE = {
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  playedMove: "e2e4",
  sequenceLength: 4,
};

async function waitForSetupSettle(page: Page) {
  await page.waitForTimeout(1200);
}

async function ensureSignedIn(page: Page) {
  await page.context().clearCookies();
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  await page.locator('input[name="email"]').fill(E2E_USER_EMAIL);
  await page.locator('input[name="password"]').fill(E2E_USER_PW);
  await page.locator('button[type="submit"]').click();

  const result = await Promise.race([
    page.waitForURL(url => !url.pathname.startsWith("/sign-in"), { timeout: 15000 }),
    page.waitForURL(url => url.href.includes("error=invalid-credentials"), { timeout: 15000 }),
  ]);
  void result;

  const finalUrl = page.url();
  console.log("After sign-in attempt, URL:", finalUrl);
  if (finalUrl.includes("error")) {
    throw new Error(`Sign-in failed: ${finalUrl}`);
  }
}

async function setupQAFlag(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
    (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents = [];
  });
}

// ── Test 1: keyboard navigation works after real sign-in ─────────────────────

test("keyboard navigation from a to b and back with real auth", async ({ page }) => {
  await setupQAFlag(page);
  await ensureSignedIn(page);

  await page.route("**/api/train/initialize", (route) => route.fulfill({ json: INIT_SKIPPED }));
  await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIXTURE_ENGINE_WHITE }));

  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSetupSettle(page);

  const initial = await page.evaluate(() => {
    const tl = (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline;
    return tl as { activeSetupReplayIndex?: number; isActiveSetupReplay?: boolean } | undefined;
  });
  console.log("Initial state:", JSON.stringify(initial));

  // ArrowLeft: index 1 -> 0
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(400);

  const afterLeft = await page.evaluate(() => {
    const tl = (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline;
    return (tl as { activeSetupReplayIndex?: number })?.activeSetupReplayIndex;
  });
  console.log("After ArrowLeft:", afterLeft);
  expect(afterLeft).toBe(0);

  // ArrowRight: index 0 -> 1
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);

  const afterRight = await page.evaluate(() => {
    const tl = (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline;
    return (tl as { activeSetupReplayIndex?: number })?.activeSetupReplayIndex;
  });
  console.log("After ArrowRight:", afterRight);
  expect(afterRight).toBe(1);
});

// ── Test 2: check page loaded correctly ────────────────────────────────────────

test("page loads train board and shows initial state", async ({ page }) => {
  await setupQAFlag(page);
  await ensureSignedIn(page);

  await page.route("**/api/train/initialize", (route) => route.fulfill({ json: INIT_SKIPPED }));
  await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIXTURE_ENGINE_WHITE }));

  await page.goto("/train", { waitUntil: "networkidle" });
  await waitForSetupSettle(page);

  const boardCount = await page.locator("[data-testid='train-board']").count();
  console.log("Board count:", boardCount);
  expect(boardCount).toBeGreaterThan(0);

  const moveRowCount = await page.locator("[data-testid='train-move-row']").count();
  console.log("Move rows:", moveRowCount);

  const tl = await page.evaluate(() => (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline);
  console.log("Timeline keys:", Object.keys(tl ?? {}));
  expect(tl).toBeDefined();
});

// ── Test 3: debug page URL after sign-in ──────────────────────────────────────

test("debug: check URL after sign-in", async ({ page }) => {
  await setupQAFlag(page);
  await ensureSignedIn(page);
  console.log("Signed in, at:", page.url());
  expect(page.url()).not.toContain("/sign-in");
});
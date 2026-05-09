import { test, expect, type Page } from "@playwright/test";
import { Chess } from "chess.js";

const E2E_USER_EMAIL = process.env.E2E_TEST_EMAIL;
const E2E_USER_PW = process.env.E2E_TEST_PW;

const INIT_READY = {
  profile: {
    blindspots_elo: 1150,
    initialization_status: "complete",
    profile_initialized: true,
    weakness_vector: {},
    mastery_vector: {},
    exploit_queue: [],
    explore_queue: [],
    revisit_queue: [],
    mastered_queue: [],
  },
  preferences: { sequence_length: 4, skill_level: "beginner" },
  linkedProfiles: [],
  shouldShowOnboarding: false,
};

const FIRST_POSITION = {
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  playedMove: "e2e4",
  sequenceLength: 4,
  source: "generated_filler",
};

async function ensureSignedIn(page: Page) {
  if (!E2E_USER_EMAIL || !E2E_USER_PW) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW to run authenticated onboarding QA.");
    return;
  }

  await page.goto("/sign-in");
  await page.fill('input[name="email"]', E2E_USER_EMAIL);
  await page.fill('input[name="password"]', E2E_USER_PW);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 15_000 });
}

async function waitTrainReady(page: Page) {
  await page.waitForFunction(() => {
    const state = (window as unknown as { __blindspotsTrainState?: Record<string, unknown> }).__blindspotsTrainState;
    return state?.state === "active" &&
      state.hasLoadedPosition === true &&
      state.isPositionLoading === false &&
      state.isOpponentThinking === false &&
      state.isAwaitingStartGesture === false;
  }, { timeout: 20_000 });
}

async function playFirstLegalMove(page: Page) {
  const fen = await page.evaluate(() => {
    return (window as unknown as { __blindspotsTrainState?: { boardFen?: string } }).__blindspotsTrainState?.boardFen;
  });
  if (!fen) throw new Error("Missing board fen.");

  const chess = new Chess(fen);
  const move = chess.moves({ verbose: true })[0];
  if (!move) throw new Error(`No legal move for ${fen}`);

  await page.locator(`[data-square="${move.from}"]`).click();
  await page.locator(`[data-square="${move.to}"]`).click();
}

test("postmortem onboarding tour runs on the real postmortem UI", async ({ page }) => {
  await page.route("**/api/train/initialize", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ json: { ok: true, status: "complete", summary: null } });
      return;
    }
    await route.fulfill({ json: INIT_READY });
  });
  await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIRST_POSITION }));
  await page.route("**/api/train/opponent-move", async (route) => {
    const body = route.request().postDataJSON() as { fen?: string };
    const chess = new Chess(body.fen);
    const move = chess.moves({ verbose: true })[0];
    await route.fulfill({
      json: {
        move: {
          uci: `${move.from}${move.to}${move.promotion ?? ""}`,
          san: move.san,
        },
      },
    });
  });
  await page.route("**/api/train/evaluate-move", async (route) => {
    await route.fulfill({
      json: {
        moveScore: {
          userMoveIndex: 0,
          classification: "inaccuracy",
          cpLoss: 22,
          evalBefore: 70,
          evalAfter: 48,
        },
        positionEvaluation: { index: 0, evalBefore: 70, evalAfter: 48 },
      },
    });
  });
  await page.route("**/api/train/engine-lines", async (route) => {
    await route.fulfill({
      json: {
        lines: Array.from({ length: 5 }, (_, index) => ({
          cp: 70 - index * 8,
          depth: 14,
          rank: index + 1,
          bestMove: ["g8f6", "b8c6", "f8c5", "d7d6", "g7g6"][index],
          bestSan: ["Nf6", "Nc6", "Bc5", "d6", "g6"][index],
          pv: [],
          pvSan: ["Nf6", "Nc6", "Bc5"],
          classification: index === 0 ? "best" : "excellent",
        })),
      },
    });
  });

  let onboardingCompleteCalled = false;
  await page.route("**/api/onboarding/complete", async (route) => {
    onboardingCompleteCalled = true;
    await route.fulfill({
      json: {
        ok: true,
        onboarding: {
          trainingOnboardingCompleted: true,
          trainingOnboardingCompletedAt: new Date().toISOString(),
        },
      },
    });
  });
  await page.route("**/api/train/complete-sequence", async (route) => {
    await route.fulfill({
      json: {
        elo: { eloBefore: 1150, eloAfter: 1180, eloDelta: 30 },
        moveScores: Array.from({ length: 4 }, (_, index) => ({
          userMoveIndex: index,
          classification: index === 0 ? "inaccuracy" : "excellent",
          cpLoss: index === 0 ? 22 : 8,
          evalBefore: 70 - index * 5,
          evalAfter: 48 - index * 3,
        })),
      },
    });
  });

  await ensureSignedIn(page);
  await page.goto("/train?onboarding=1", { waitUntil: "domcontentloaded" });

  for (const headline of [
    "Welcome.",
    "The board.",
    "Eval preservation.",
    "Your first run.",
  ]) {
    await expect(page.getByRole("heading", { name: headline })).toBeVisible();
    await page.getByRole("button", { name: headline === "Your first run." ? "Press to Start" : "Next" }).click();
  }

  for (let index = 0; index < 4; index += 1) {
    await waitTrainReady(page);
    await playFirstLegalMove(page);
  }

  await page.waitForFunction(() => {
    return (window as unknown as { __blindspotsTrainState?: { isPostMortemVisible?: boolean } })
      .__blindspotsTrainState?.isPostMortemVisible === true;
  }, { timeout: 30_000 });

  const steps = [
    { headline: "A number, doing its best.", target: "elo-card" },
    { headline: "Top five, ranked by cp.", target: "engine-lines" },
    { headline: "The crime scene, in line-chart form.", target: "eval-graph" },
    { headline: "Receipts.", target: "move-table" },
    { headline: "Tape a note to your future self.", target: "notes-panel" },
    { headline: "Another one, or call it.", target: "postmortem-actions" },
  ];

  for (const [index, step] of steps.entries()) {
    await expect(page.getByRole("heading", { name: step.headline })).toBeVisible();
    await expect(page.locator(`[data-tour="${step.target}"]`)).toBeVisible();
    if (step.target === "notes-panel") {
      await expect(page.getByRole("button", { name: "Notes" })).toHaveClass(/text-\[var\(--app-accent\)\]/);
    }
    await page.getByRole("button", { name: index === steps.length - 1 ? "Finish onboarding" : "Next" }).click();
  }

  await expect.poll(() => onboardingCompleteCalled).toBe(true);
  await expect(page.getByRole("dialog", { name: "Postmortem onboarding" })).toHaveCount(0);
  expect(page.url()).toContain("/train");
});

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({
  storageState: ".auth/user.json",
});

type NextPositionResponse = {
  fen?: string;
  previousFen?: string;
  playedMove?: string;
  sequenceLength?: number;
  source?: string;
  error?: string;
  debug?: Record<string, unknown>;
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

const MOCK_PAYLOAD: NextPositionResponse = {
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  playedMove: "e2e4",
  sequenceLength: 4,
  source: "elite",
};

const MOCK_BOARD_FEN = "8/2k3pp/p2r4/2K1p3/1R2Pp2/P4P2/6PP/8 w - - 0 57";

async function readTrainBoardFen(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const win = window as unknown as {
      __blindspotsTrainState?: { fen?: string };
    };
    return (win.__blindspotsTrainState?.fen as string) ?? null;
  });
}

async function waitForTrainBoardFen(page: Page, timeoutMs = 5000): Promise<string> {
  const pollStart = Date.now();
  while (Date.now() - pollStart < timeoutMs) {
    const fen = await readTrainBoardFen(page);
    if (fen !== null) return fen;
    await page.waitForTimeout(150);
  }
  const lastAttempt = await readTrainBoardFen(page);
  if (lastAttempt === null) throw new Error("Train board FEN remained null after polling");
  return lastAttempt;
}

// ─── Test A: No mockRep.fen flash during delayed load ────────────────────────

test(
  "A: no mockRep.fen flash while loading a delayed real position",
  async ({ page: p }) => {
    const cookies = JSON.parse(readFileSync(".auth/user.json", "utf8")).cookies;
    await p.context().addCookies(cookies);

    let resolveNextPosition: ((value: NextPositionResponse) => void) | null = null;
    const nextPositionPromise = new Promise<NextPositionResponse>((resolve) => {
      resolveNextPosition = resolve;
    });

    await p.route("**/api/train/initialize", (route) => {
      route.fulfill({ json: INIT_SKIPPED });
    });

    await p.route("**/api/train/next-position", async (route) => {
      const payload = await nextPositionPromise;
      route.fulfill({ json: payload });
    });

    await p.goto("/train");

    // During the delay: board must NOT show mockRep.fen
    const liveFen = await readTrainBoardFen(p);
    if (liveFen !== null) {
      expect(liveFen).not.toEqual(MOCK_BOARD_FEN);
    }

    // Loading copy should not be shown while the request is pending.
    await expect(p.locator("text=No position available")).toHaveCount(0);

    // Resolve with a real position
    resolveNextPosition!(MOCK_PAYLOAD);

    // After resolution the overlay appears (engine-setup position)
    const overlay = p.locator("[data-testid='audio-unlock-overlay']");
    await expect(overlay).toBeVisible({ timeout: 5000 });
  },
);

// ─── Test B: Board shows previousFen first, then final fen after gesture ─────

test(
  "B: board reaches previousFen immediately, then fen after gesture unlock",
  async ({ page: p }) => {
    const cookies = JSON.parse(readFileSync(".auth/user.json", "utf8")).cookies;
    await p.context().addCookies(cookies);

    await p.route("**/api/train/initialize", (route) => {
      route.fulfill({ json: INIT_SKIPPED });
    });

    await p.route("**/api/train/next-position", (route) => {
      route.fulfill({ json: MOCK_PAYLOAD });
    });

    await p.goto("/train");

    // Poll for the train state to be populated
    const boardFenBefore = await waitForTrainBoardFen(p, 12000);

    // Board should be visible (it renders after hasLoadedPosition=true)
    const board = p.locator("[data-testid='train-board']");
    await expect(board).toBeVisible({ timeout: 5000 });

    // Board should be showing previousFen (state was already polled above)
    expect(boardFenBefore).toEqual(MOCK_PAYLOAD.previousFen);

    // Overlay is present
    const overlay = p.locator("[data-testid='audio-unlock-overlay']");
    await expect(overlay).toBeVisible();

    // Click overlay to unlock and play initial engine move
    await overlay.click();
    await p.waitForTimeout(1500);

    // Overlay is gone
    await expect(overlay).not.toBeVisible();

    // Board should now show the final fen
    const boardFenAfter = await readTrainBoardFen(p);
    expect(boardFenAfter).toEqual(MOCK_PAYLOAD.fen);

    // Move table should have one row (the engine move)
    const moveRows = p.locator("[data-testid='train-move-row']");
    await expect(moveRows).toHaveCount(1);

    // Engine move cell should show the played move notation
    const engineMoveCell = p
      .locator("[data-testid='train-move-row'] [data-testid='train-move-white']")
      .first();
    const moveText = await engineMoveCell.textContent();
    expect(moveText?.trim()).toMatch(/e4/i);
  },
);

// ─── Test C: Board never renders mockRep.fen in normal non-delayed flow ───────

test(
  "C: board never renders mockRep.fen during a normal (non-delayed) load",
  async ({ page: p }) => {
    const cookies = JSON.parse(readFileSync(".auth/user.json", "utf8")).cookies;
    await p.context().addCookies(cookies);

    await p.route("**/api/train/initialize", (route) => {
      route.fulfill({ json: INIT_SKIPPED });
    });

    await p.route("**/api/train/next-position", (route) => {
      route.fulfill({ json: MOCK_PAYLOAD });
    });

    await p.goto("/train");

    // Poll for the train state to be populated
    await waitForTrainBoardFen(p, 12000);

    // Board must be visible (after hasLoadedPosition=true and API response)
    const board = p.locator("[data-testid='train-board']");
    await expect(board).toBeVisible({ timeout: 5000 });

    // Board must never have shown mockRep.fen
    const liveFen = await readTrainBoardFen(p);
    if (liveFen !== null) {
      expect(liveFen).not.toEqual(MOCK_BOARD_FEN);
    }

    // Unlock and wait for final state
    const overlay = p.locator("[data-testid='audio-unlock-overlay']");
    await overlay.click();
    await p.waitForTimeout(1500);

    // Final board FEN should equal payload fen
    const finalLiveFen = await readTrainBoardFen(p);
    expect(finalLiveFen).toEqual(MOCK_PAYLOAD.fen);
  },
);

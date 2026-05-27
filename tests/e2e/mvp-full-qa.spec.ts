import { test, expect, type Page } from "@playwright/test";
import { Chess } from "chess.js";

// Full end-to-end QA of the Blindspots MVP training loop, driven as a real user.
// Runs serially against a live dev server using the stored authenticated state.

test.describe.configure({ mode: "serial" });

const FORBIDDEN_NARRATION = [
  "position ready",
  "sequence in progress",
  "your turn",
  "every legal move is saved",
  "maia is thinking",
  "temporary mode",
  "saving move",
  "loading next sequence",
  "evaluating and completing sequence",
];

async function waitForBoard(page: Page) {
  await page.waitForSelector(".bs-kit-analysis-board", { timeout: 90_000 });
}

async function activeSession(page: Page) {
  return page.evaluate(async () => {
    const r = await fetch("/api/train/active-session", { cache: "no-store" });
    return r.ok ? await r.json() : null;
  });
}

async function loadedFen(page: Page): Promise<string> {
  const np = await page.evaluate(async () => {
    const r = await fetch("/api/train/next-position", { cache: "no-store" });
    return await r.json();
  });
  return np.fen as string;
}

async function clickSquare(page: Page, square: string) {
  await page.locator(`.bs-kit-analysis-board >> role=button[name="${square}"]`).click({ timeout: 8_000 });
}

// Play one legal learner move on the current board; returns the played uci.
async function playLearnerMove(page: Page, fen: string): Promise<string> {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  // Prefer a quiet move; fall back to the first legal move.
  const move = moves.find((m) => !m.captured && !m.san.includes("+")) ?? moves[0]!;
  await clickSquare(page, move.from);
  await page.waitForTimeout(250);
  await clickSquare(page, move.to);
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

async function assertNoForbiddenNarration(page: Page) {
  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const phrase of FORBIDDEN_NARRATION) {
    expect(body, `must not narrate: "${phrase}"`).not.toContain(phrase);
  }
  expect(body).not.toContain("????");
  expect(body).not.toContain("positions due");
}

test("1. boot shows splash, reaches a ready interactive board, no narration, no hydration error", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push("PAGEERR " + e.message));

  await page.goto("/");
  await expect(page.getByTestId("spa-boot-splash")).toBeVisible();
  await waitForBoard(page);

  // Splash dismisses once Maia is ready (allow generous time for the 21MB model).
  await expect(page.getByTestId("spa-boot-splash")).toHaveCount(0, { timeout: 90_000 });

  await assertNoForbiddenNarration(page);

  const hydration = consoleErrors.filter((e) => /hydrat|did not match/i.test(e));
  expect(hydration, hydration.join("\n")).toHaveLength(0);
});

test("2. player strips show only You / Opponent", async ({ page }) => {
  await page.goto("/");
  await waitForBoard(page);
  const names = await page.locator(".bs-kit-player-strip .name").allInnerTexts();
  for (const name of names) {
    expect(["You", "Opponent"]).toContain(name.trim());
  }
});

test("3. learner plays one move, Maia replies automatically, both persist invisibly", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

  await page.goto("/");
  await waitForBoard(page);
  await expect(page.getByTestId("spa-boot-splash")).toHaveCount(0, { timeout: 90_000 });

  // Ensure a clean cold candidate: discard any restored active session first.
  if (await page.getByTestId("spa-discard-sequence").count()) {
    await page.getByTestId("spa-discard-sequence").click();
    await page.waitForTimeout(4_000);
    await waitForBoard(page);
  }

  const fen = await loadedFen(page);
  const learnerUci = await playLearnerMove(page, fen);

  // Maia must add a reply ply (>=2 total) without any save/status text.
  let session: any = null;
  for (let i = 0; i < 40; i++) {
    session = await activeSession(page);
    if (session?.session && session.session.moves.length >= 2) break;
    await page.waitForTimeout(1_500);
  }
  expect(session?.session?.moves?.length, "Maia reply should be appended").toBeGreaterThanOrEqual(2);
  expect(session.session.moves[0].uci).toBe(learnerUci);

  await assertNoForbiddenNarration(page);
  const realErrors = consoleErrors.filter((e) => !/favicon|404/.test(e));
  expect(realErrors, realErrors.join("\n")).toHaveLength(0);
});

test("4. refresh mid-sequence restores the exact persisted history", async ({ page }) => {
  await page.goto("/");
  await waitForBoard(page);
  await page.waitForTimeout(4_000);

  const before = await activeSession(page);
  const beforeMoves: string[] = before?.session ? before.session.moves.map((m: any) => m.uci) : [];
  expect(beforeMoves.length, "a sequence from the prior test should still be active").toBeGreaterThanOrEqual(2);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForBoard(page);
  await page.waitForTimeout(4_000);

  const after = await activeSession(page);
  const afterMoves: string[] = after?.session ? after.session.moves.map((m: any) => m.uci) : [];
  expect(afterMoves).toEqual(beforeMoves);
});

test("5. Finish enters analysis, Stockfish renders real results, completion saves as Unrated, Next appears", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

  await page.goto("/");
  await waitForBoard(page);
  await page.waitForTimeout(4_000);

  // Ensure an active sequence exists; if not, create one.
  let session = await activeSession(page);
  if (!session?.session) {
    const fen = await loadedFen(page);
    await playLearnerMove(page, fen);
    for (let i = 0; i < 40; i++) {
      session = await activeSession(page);
      if (session?.session && session.session.moves.length >= 2) break;
      await page.waitForTimeout(1_500);
    }
  }

  await page.locator('button:has-text("Finish sequence")').click({ timeout: 15_000 });

  // Analysis panel renders an outcome.
  let panel = "";
  for (let i = 0; i < 50; i++) {
    panel = await page.getByTestId("spa-client-analysis").innerText().catch(() => "");
    if (/Passed|Acceptable|Failed/.test(panel)) break;
    await page.waitForTimeout(2_000);
  }
  expect(panel).toMatch(/Passed|Acceptable|Failed/);
  expect(panel).toContain("average CPL");
  expect(panel).toContain("Unrated");

  // Completion saved -> Next sequence available, no save error, no duplicate completion panel.
  await expect(page.locator("text=Next sequence")).toBeVisible({ timeout: 60_000 });
  expect(await page.getByTestId("spa-completion-save-error").count()).toBe(0);
  expect(await page.getByTestId("spa-training-completion-result").count()).toBe(0);

  // Selecting a learner move navigates the board (no crash).
  const moveButtons = page.locator('[data-testid="spa-client-analysis"] .bs-kit-stat-list button');
  if (await moveButtons.count()) {
    await moveButtons.first().click();
  }

  const realErrors = consoleErrors.filter((e) => !/favicon|404/.test(e));
  expect(realErrors, realErrors.join("\n")).toHaveLength(0);
});

test("6. Next sequence loads a fresh playable position", async ({ page }) => {
  await page.goto("/");
  await waitForBoard(page);
  await page.waitForTimeout(4_000);

  if (await page.locator("text=Next sequence").count()) {
    await page.locator("text=Next sequence").click();
    await page.waitForTimeout(5_000);
  }
  // A playable cold candidate should be available.
  const fen = await loadedFen(page);
  const chess = new Chess(fen);
  expect(chess.isGameOver()).toBe(false);
  expect(chess.moves().length).toBeGreaterThan(0);
});

test("7. learner cannot move opponent pieces", async ({ page }) => {
  await page.goto("/");
  await waitForBoard(page);
  await expect(page.getByTestId("spa-boot-splash")).toHaveCount(0, { timeout: 90_000 });
  await page.waitForTimeout(3_000);

  const fen = await loadedFen(page);
  const chess = new Chess(fen);
  const learner = chess.turn();
  // Find an opponent piece square.
  const board = chess.board();
  let opponentSquare: string | null = null;
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.color !== learner) { opponentSquare = cell.square; break; }
    }
    if (opponentSquare) break;
  }
  expect(opponentSquare).not.toBeNull();

  // Clicking an opponent piece should not select it (no legal-target highlight appears).
  await clickSquare(page, opponentSquare!);
  await page.waitForTimeout(500);
  // The session must not have gained a move from clicking opponent pieces.
  const session = await activeSession(page);
  const moveCount = session?.session ? session.session.moves.length : 0;
  // Either no session yet (cold) or unchanged — clicking an opponent piece never creates a move.
  expect(moveCount === 0 || moveCount % 2 === 0).toBeTruthy();
});

test("8. discard escape abandons the active sequence and loads a fresh one", async ({ page }) => {
  await page.goto("/");
  await waitForBoard(page);
  await expect(page.getByTestId("spa-boot-splash")).toHaveCount(0, { timeout: 90_000 });
  await page.waitForTimeout(3_000);

  // Start a sequence so discard has something to abandon.
  let session = await activeSession(page);
  if (!session?.session) {
    const fen = await loadedFen(page);
    await playLearnerMove(page, fen);
    for (let i = 0; i < 30; i++) {
      session = await activeSession(page);
      if (session?.session) break;
      await page.waitForTimeout(1_500);
    }
  }
  const abandonedId = session?.session?.id ?? null;

  await expect(page.getByTestId("spa-discard-sequence")).toBeVisible();
  await page.getByTestId("spa-discard-sequence").click();
  await page.waitForTimeout(6_000);

  const after = await activeSession(page);
  const afterId = after?.session?.id ?? null;
  // The previously active session must no longer be the active one.
  if (abandonedId) expect(afterId).not.toBe(abandonedId);
});

test("9. Add FEN rejects invalid input and accepts a valid position", async ({ page }) => {
  await page.goto("/");
  await waitForBoard(page);
  await page.waitForTimeout(3_000);

  await page.locator('button:has-text("Add FEN")').click({ timeout: 8_000 });
  await page.locator(".bs-kit-add-fen input").fill("totally not a fen");
  await page.locator('.bs-kit-add-fen button:has-text("Add")').click();
  await expect(page.getByTestId("spa-add-fen-error")).toBeVisible({ timeout: 8_000 });

  await page.locator(".bs-kit-add-fen input").fill("r1bqk2r/pp2bppp/2n1pn2/3p4/3PP3/2NB1N2/PPP2PPP/R1BQK2R w KQkq - 0 7");
  await page.locator('.bs-kit-add-fen button:has-text("Add")').click();
  await expect(page.locator(".bs-kit-add-fen")).toHaveCount(0, { timeout: 8_000 });
});

test("10. no inert Settings control remains in the toolbar", async ({ page }) => {
  await page.goto("/");
  await waitForBoard(page);
  await expect(page.getByTestId("spa-settings-placeholder")).toHaveCount(0);
  const toolbar = await page.locator(".bs-kit-shell-actions").innerText();
  expect(toolbar).not.toContain("Settings");
});

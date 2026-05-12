import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";

// Diagnostic FENs
const FENS = [
  { name: "balanced", fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 2 3" },
  { name: "black-to-move", fen: "rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4" },
  { name: "endgame", fen: "8/8/2k5/6p1/6P1/2K5/8/8 w - - 0 1" },
  { name: "tactical", fen: "r2qkbnr/ppp2ppp/2np4/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 6" },
  { name: "mate-heavy", fen: "3r4/5p1p/p4p2/4p3/1p4P1/4NK2/PP1p1R1P/4k3 w - - 0 42" },
];

function debugUrl(fen: string, mode = "postmortem") {
  return `${BASE}/train?debugMode=${mode}&debugFEN=${encodeURIComponent(fen)}`;
}

test("Part 1: Verify authenticated /train access", async ({ page }) => {
  await page.goto(`${BASE}/train`);
  await page.waitForTimeout(3000);

  const url = page.url();
  console.log(`Final URL: ${url}`);
  console.log(`On sign-in page: ${url.includes("sign-in")}`);
  console.log(`On train page: ${url.includes("/train")}`);

  // Take screenshot for manual verification
  await page.screenshot({ path: "test-results/diag-v2-auth-check.png", fullPage: true });

  // Check what's visible
  const signInElements = await page.locator("text=Sign in").count();
  const trainElements = await page.locator("text=Blindspots.gg").count();
  console.log(`Sign-in elements: ${signInElements}`);
  console.log(`Train elements: ${trainElements}`);

  expect(page.url()).toContain("/train");
});

test("Part 2: Debug URL with authenticated session", async ({ page }) => {
  // First navigate to /train to warm up the auth session
  await page.goto(`${BASE}/train`);
  await page.waitForTimeout(2000);

  // Check we're authenticated
  const isOnTrain = page.url().includes("/train") && !page.url().includes("sign-in");
  console.log(`Authenticated on /train: ${isOnTrain}`);

  if (!isOnTrain) {
    console.log("Not authenticated - skipping debug URL tests");
    return;
  }

  // Try first debug FEN
  const testFen = FENS[0].fen;
  const url = debugUrl(testFen);
  console.log(`Navigating to debug URL: ${url}`);

  await page.goto(url);
  await page.waitForTimeout(3000);

  const finalUrl = page.url();
  console.log(`Final URL after debug nav: ${finalUrl}`);
  console.log(`Redirected to sign-in: ${finalUrl.includes("sign-in")}`);

  // Check if eval bar appears
  const evalBar = page.locator("[data-testid=eval-bar]");
  const hasEvalBar = await evalBar.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`Eval bar visible: ${hasEvalBar}`);

  if (hasEvalBar) {
    const data = {
      whitePct: await evalBar.getAttribute("data-white-pct"),
      blackPct: await evalBar.getAttribute("data-black-pct"),
      decisiveSide: await evalBar.getAttribute("data-decisive-side"),
      label: await evalBar.getAttribute("data-eval-label"),
    };
    console.log(`Eval bar data: ${JSON.stringify(data)}`);
  }

  await page.screenshot({ path: "test-results/diag-v2-debug-url.png", fullPage: true });
});

test("Part 3: Active training eval collection (normal /train)", async ({ page }) => {
  // Navigate to /train as normal
  await page.goto(`${BASE}/train`);
  await page.waitForTimeout(4000);

  const isOnTrain = page.url().includes("/train") && !page.url().includes("sign-in");
  if (!isOnTrain) {
    console.log("Not authenticated - cannot run diagnostics");
    return;
  }

  // Wait for position to load (board should be visible)
  await page.waitForTimeout(3000);

  // Check for network activity by monitoring
  const netLogs: any[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/train/")) {
      try {
        const body = await response.json().catch(() => ({}));
        netLogs.push({ url: url.replace(BASE, ""), status: response.status(), body });
        console.log(`[NET] ${url.replace(BASE, "")} -> ${response.status()}`);
      } catch {}
    }
  });

  // Wait more for engine lines to arrive
  await page.waitForTimeout(5000);

  // Check board state
  const boardEl = page.locator("[data-testid=train-board]");
  const hasBoard = await boardEl.isVisible({ timeout: 2000 }).catch(() => false);

  // Check eval bar
  const evalBar = page.locator("[data-testid=eval-bar]");
  const hasEvalBar = await evalBar.isVisible({ timeout: 3000 }).catch(() => false);

  // Check for postmortem elements
  const postmortemEl = page.locator("text=Next Position").first();
  const hasPostmortem = await postmortemEl.isVisible({ timeout: 3000 }).catch(() => false);

  console.log(`Board visible: ${hasBoard}`);
  console.log(`Eval bar visible: ${hasEvalBar}`);
  console.log(`Postmortem visible: ${hasPostmortem}`);
  console.log(`Network calls captured: ${netLogs.length}`);

  // Print network summary
  for (const log of netLogs) {
    const bodyStr = JSON.stringify(log.body).substring(0, 200);
    console.log(`  ${log.url}: ${log.status} - ${bodyStr}`);
  }

  await page.screenshot({ path: "test-results/diag-v2-active-train.png", fullPage: true });
});

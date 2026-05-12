import { test } from "@playwright/test";

const BASE = "http://localhost:3000";
const FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 2 3";

test("Quick engine line diagnostic", async ({ page }) => {
  await page.goto(`${BASE}/train?debugMode=postmortem&debugFEN=${encodeURIComponent(FEN)}`);

  // Check state at intervals
  for (let s = 2; s <= 20; s += 2) {
    await page.waitForTimeout(2000);

    const bar = page.locator("[data-testid=eval-bar]");
    const label = await bar.getAttribute("data-eval-label").catch(() => "N/A");
    const side = await bar.getAttribute("data-decisive-side").catch(() => "N/A");

    // Also check page for engine line text
    const pageText = await page.locator("body").textContent();
    const hasEvalNumbers = /\+\d+\.\d|-\d+\.\d|M\d+/i.test(pageText ?? "");
    const hasGameOver = (pageText ?? "").includes("Game over");

    console.log(`${s}s: eval=${label} side=${side} evals=${hasEvalNumbers} gameover=${hasGameOver}`);

    if (hasEvalNumbers || hasGameOver || (label && label !== "..." && label !== "--")) {
      console.log(`Engine lines arrived at ${s}s`);
      await page.screenshot({ path: `test-results/quick-diag-${s}s.png`, fullPage: true });
      return;
    }
  }

  console.log("Engine lines never arrived within 20s");
  await page.screenshot({ path: "test-results/quick-diag-timeout.png", fullPage: true });
});

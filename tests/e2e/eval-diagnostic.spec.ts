import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";

test("Diagnostic: eval consistency across postmortem surfaces", async ({ page }) => {
  const results: any[] = [];

  // Navigate to normal /train (uses stored auth)
  await page.goto(`${BASE}/train`, { waitUntil: "domcontentloaded" });
  console.log("Loaded /train");

  // Wait for position to load and game to be playable
  await page.waitForTimeout(3000);

  // Check if postmortem UI is already visible (from previous session)
  const isPostmortem = await page.locator("[data-testid=eval-bar]").isVisible({ timeout: 3000 }).catch(() => false);

  if (isPostmortem) {
    console.log("Already in postmortem - reading surface data");
  } else {
    console.log("Active training - checking board state");
  }

  // Capture page content snapshot
  const bodyText = await page.locator("body").textContent();
  console.log("Page content length:", bodyText?.length ?? 0);

  // Check for eval bar
  const evalBar = page.locator("[data-testid=eval-bar]");
  const hasEvalBar = await evalBar.isVisible({ timeout: 2000 }).catch(() => false);
  console.log("Eval bar visible:", hasEvalBar);

  if (hasEvalBar) {
    const attrs = {
      whitePct: await evalBar.getAttribute("data-white-pct"),
      blackPct: await evalBar.getAttribute("data-black-pct"),
      decisiveSide: await evalBar.getAttribute("data-decisive-side"),
      label: await evalBar.getAttribute("data-eval-label"),
    };
    console.log("Eval bar data:", JSON.stringify(attrs));
  }

  // Check for engine lines using text content matching
  const engineSectionText = await page.locator("text=Engine lines").first().textContent().catch(() => null);
  console.log("Engine lines section found:", engineSectionText != null);

  // Check for move table
  const moveSectionText = await page.locator("text=Move").first().textContent().catch(() => null);
  console.log("Move section found:", moveSectionText != null);

  // Capture console errors
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  console.log("\n=== DIAGNOSTIC SUMMARY ===");
  console.log("Eval bar:", hasEvalBar ? "present" : "absent");
  console.log("Engine section:", engineSectionText ? "present" : "absent");
  console.log("Move section:", moveSectionText ? "present" : "absent");
  console.log("Console errors:", errors.length);

  await page.screenshot({ path: "test-results/diagnostic-main.png", fullPage: true });
});

import { test, expect } from "@playwright/test";

// Focused MVP verification of the live SPA training loop.
// Uses the stored authenticated storage state from playwright.config.ts.

test("boot: splash shows, no normal-state narration, board appears once Maia ready", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/");

  // Splash is visible during boot.
  const splash = page.getByTestId("spa-boot-splash");
  await expect(splash).toBeVisible();

  // Board eventually becomes present (Maia ready + hydration complete).
  await expect(page.locator(".bs-kit-analysis-board")).toBeVisible({ timeout: 60_000 });

  // No forbidden normal-state narration anywhere in the DOM.
  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  for (const phrase of [
    "position ready",
    "sequence in progress",
    "your turn",
    "every legal move is saved",
    "maia is thinking",
    "temporary mode",
    "saving move",
    "loading next sequence",
    "evaluating and completing sequence",
  ]) {
    expect(bodyText, `must not narrate: ${phrase}`).not.toContain(phrase);
  }

  // No fake rating / today surfaces.
  expect(bodyText).not.toContain("????");
  expect(bodyText).not.toContain("1842");
  expect(bodyText).not.toContain("positions due");

  // No React hydration mismatch errors.
  const hydrationErrors = consoleErrors.filter((e) =>
    /hydrat/i.test(e) || /did not match/i.test(e),
  );
  expect(hydrationErrors, hydrationErrors.join("\n")).toHaveLength(0);
});

test("player strips show only You / Opponent", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".bs-kit-analysis-board")).toBeVisible({ timeout: 60_000 });

  const strips = page.locator(".bs-kit-player-strip .name");
  const names = await strips.allInnerTexts();
  for (const name of names) {
    expect(["You", "Opponent"]).toContain(name.trim());
  }
});

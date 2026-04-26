import { chromium } from "playwright-core";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Sign in
  await page.goto("http://localhost:3000/sign-in", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('input[type="email"]').first().fill("test-user@example.com");
  await page.locator('input[type="password"]').first().fill("Password123!");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(5000);

  // Go to train
  await page.goto("http://localhost:3000/train", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(5000);

  // Handle onboarding
  const skipBtn = page.locator('button:has-text("Skip"), button:has-text("Start training")');
  if (await skipBtn.count() > 0) {
    console.log("Clicking onboarding button:", await skipBtn.first().textContent());
    await skipBtn.first().click();
    await page.waitForTimeout(8000);
  }

  await page.screenshot({ path: "qa-artifacts/train-debug.png", fullPage: true });

  // Check state
  const thinking = page.locator('text=/Opponent thinking/i');
  console.log("Opponent thinking visible:", await thinking.count());

  const promptText = page.locator('text=/White to play|Black to play/i');
  if (await promptText.count() > 0) {
    console.log("Prompt visible:", await promptText.first().textContent());
  }

  // Check if there's a move list showing the engine's initial move
  const moveListText = page.locator('aside').textContent();
  const moveListContent = await moveListText;
  console.log("Sidebar content snippet:", moveListContent?.substring(0, 200));

  // Check board
  const squares = page.locator('[data-square]');
  console.log("Board squares:", await squares.count());

  // Check if last move is highlighted
  const originEmphasized = page.locator('[class*="origin-border"]');
  console.log("Origin emphasized (selected/move squares):", await originEmphasized.count());

  await page.waitForTimeout(2000);
  await browser.close();
}

main().catch(console.error);

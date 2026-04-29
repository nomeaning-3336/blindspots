import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({ storageState: ".auth/user.json" });

async function addAuthCookies(page) {
  const cookies = JSON.parse(readFileSync(".auth/user.json", "utf8")).cookies;
  await page.context().addCookies(cookies);
}

test("drag ghost is centered under cursor with full-square wrapper", async ({ page }) => {
  await addAuthCookies(page);

  const INIT_SKIPPED = {
    profile: { initialization_status: "skipped", profile_initialized: false, weakness_vector: {}, mastery_vector: {}, exploit_queue: [], explore_queue: [], revisit_queue: [], mastered_queue: [] },
    preferences: { sequence_length: 4 },
    linkedProfiles: [],
    shouldShowOnboarding: false,
  };

  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: INIT_SKIPPED });
  });
  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({
      json: {
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        playedMove: "e2e4",
        sequenceLength: 4,
        source: "elite",
      },
    });
  });

  await page.goto("http://localhost:3000/train");

  // Wait for board
  const board = page.locator("[data-testid='train-board']");
  await expect(board).toBeVisible({ timeout: 10000 });

  // Dismiss audio overlay
  const overlay = page.locator("[data-testid='audio-unlock-overlay']");
  if (await overlay.isVisible({ timeout: 2000 })) {
    await overlay.click();
    await page.waitForTimeout(1500);
  }

  // Get board bounding box
  const boardBox = await board.boundingBox();
  const squareSize = boardBox.width / 8;

  // Click center of e4 square (col=4, row=3 in 0-indexed)
  const e4X = boardBox.x + (4 + 0.5) * squareSize;
  const e4Y = boardBox.y + (3 + 0.5) * squareSize;

  await page.mouse.move(e4X, e4Y);
  await page.mouse.down();
  await page.waitForTimeout(400);

  // Find the drag wrapper div (fixed, z-9999)
  const wrapperInfo = await page.evaluate(() => {
    const allEls = document.querySelectorAll("*");
    for (const el of allEls) {
      const s = window.getComputedStyle(el);
      if (s.position === "fixed" && s.zIndex === "9999" && s.display.includes("flex")) {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      }
    }
    return null;
  });

  await page.mouse.up();

  expect(wrapperInfo).not.toBeNull("Drag wrapper should exist");

  // Check wrapper is centered on cursor
  const wrapperCenterX = wrapperInfo.left + wrapperInfo.width / 2;
  const wrapperCenterY = wrapperInfo.top + wrapperInfo.height / 2;

  const offsetX = Math.abs(wrapperCenterX - e4X);
  const offsetY = Math.abs(wrapperCenterY - e4Y);

  console.log(`Wrapper center: (${wrapperCenterX.toFixed(1)}, ${wrapperCenterY.toFixed(1)})`);
  console.log(`Expected (cursor): (${e4X.toFixed(1)}, ${e4Y.toFixed(1)})`);
  console.log(`Offset: (${offsetX.toFixed(1)}px, ${offsetY.toFixed(1)}px)`);
  console.log(`Wrapper size: ${wrapperInfo.width.toFixed(1)} x ${wrapperInfo.height.toFixed(1)}`);

  // Full square size check (not 0.86x)
  const squareSizeRatio = wrapperInfo.width / squareSize;
  console.log(`Wrapper/SquareSize ratio: ${squareSizeRatio.toFixed(3)}`);
  expect(squareSizeRatio).toBeCloseTo(1.0, 2);

  // Centered check - within 3% of square size
  const tolerance = squareSize * 0.03;
  expect(offsetX).toBeLessThan(tolerance, `X offset ${offsetX.toFixed(1)}px exceeds tolerance ${tolerance.toFixed(1)}px`);
  expect(offsetY).toBeLessThan(tolerance, `Y offset ${offsetY.toFixed(1)}px exceeds tolerance ${tolerance.toFixed(1)}px`);
});
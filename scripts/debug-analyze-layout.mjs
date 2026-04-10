import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const authStatePath = path.resolve("tmp/playwright-auth.json");
const screenshotDir = path.resolve("tmp/playwright-layout");

const pgn = `[Event "Layout Test"]
[Site "Local"]
[Date "2026.04.09"]
[Round "1"]
[White "WhiteUser"]
[Black "BlackUser"]
[WhiteElo "1500"]
[BlackElo "1600"]
[Result "*"]

1. e4 {[%clk 0:10:00]} c5 {[%clk 0:10:00]} 2. Nf3 {[%clk 0:09:58]} d6 {[%clk 0:09:59]} 3. d4 {[%clk 0:09:56]} cxd4 {[%clk 0:09:57]} 4. Nxd4 {[%clk 0:09:54]} Nf6 {[%clk 0:09:55]} *`;

const viewports = [
  { width: 1440, height: 1100 },
  { width: 1180, height: 900 },
  { width: 1024, height: 820 },
  { width: 900, height: 760 },
];

async function inspectViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport,
    storageState: fs.existsSync(authStatePath) ? authStatePath : undefined,
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3000/analyze", { waitUntil: "networkidle" });
  await page.click("#importBtn");
  await page.fill("#importInput", pgn);
  await page.click("#submitImportBtn");
  await page.waitForTimeout(1200);
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const overlaps = (a, b) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

    const board = document.querySelector("#boardShell");
    const top = document.querySelector("#topPlayerInfo");
    const bottom = document.querySelector("#bottomPlayerInfo");
    if (!board || !top || !bottom) {
      return { error: "Missing board/player strip elements" };
    }

    const boardRect = rect(board);
    const playerData = (root) => {
      const rootRect = rect(root);
      const items = Array.from(
        root.querySelectorAll(".player-name, .player-rating, .player-clock, .captured-piece"),
      ).map((el) => ({
        className: el.className,
        text: (el.textContent || "").trim(),
        ...rect(el),
      }));
      const clippedItems = items.filter(
        (item) =>
          item.width <= 1 ||
          item.height <= 1 ||
          item.left < rootRect.left ||
          item.right > rootRect.right ||
          item.top < rootRect.top ||
          item.bottom > rootRect.bottom,
      );
      return {
        rootRect,
        text: (root.textContent || "").replace(/\s+/g, " ").trim(),
        items,
        clippedItems,
      };
    };

    const topData = playerData(top);
    const bottomData = playerData(bottom);

    return {
      boardRect,
      top: topData,
      bottom: bottomData,
      topOverlapsBoard: overlaps(topData.rootRect, boardRect),
      bottomOverlapsBoard: overlaps(bottomData.rootRect, boardRect),
    };
  });

  fs.mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = path.join(screenshotDir, `analyze-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await context.close();
  return { viewport, screenshotPath, ...result };
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const results = [];
    for (const viewport of viewports) {
      results.push(await inspectViewport(browser, viewport));
    }
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

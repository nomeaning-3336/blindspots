import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";

async function getEngineLines(request: any, fen: string) {
  const resp = await request.post(`${BASE}/api/train/engine-lines`, {
    data: { fen },
  });
  const body = await resp.json();
  return body.lines ?? [];
}

async function playMove(page: any, from: string, to: string) {
  // Click source square, then destination square
  const board = page.locator("[data-testid=train-board]");
  const box = await board.boundingBox();
  if (!box) throw new Error("Board not found");

  const files = "abcdefgh";
  const fileSize = box.width / 8;
  const rankSize = box.height / 8;

  // Determine file/rank based on orientation (white by default for debug)
  const fromFile = files.indexOf(from[0]);
  const fromRank = parseInt(from[1]) - 1;
  const toFile = files.indexOf(to[0]);
  const toRank = parseInt(to[1]) - 1;

  // For white orientation, a1 = bottom-left
  const fromX = box.x + fromFile * fileSize + fileSize / 2;
  const fromY = box.y + (7 - fromRank) * rankSize + rankSize / 2;
  const toX = box.x + toFile * fileSize + fileSize / 2;
  const toY = box.y + (7 - toRank) * rankSize + rankSize / 2;

  await page.mouse.click(fromX, fromY);
  await page.waitForTimeout(200);
  await page.mouse.click(toX, toY);
  await page.waitForTimeout(1000);
}

async function readEvalBar(page: any) {
  const bar = page.locator("[data-testid=eval-bar]");
  if (!(await bar.isVisible({ timeout: 2000 }).catch(() => false))) return null;
  return {
    whitePct: await bar.getAttribute("data-white-pct"),
    blackPct: await bar.getAttribute("data-black-pct"),
    decisiveSide: await bar.getAttribute("data-decisive-side"),
    label: await bar.getAttribute("data-eval-label"),
  };
}

async function captureNetwork(page: any, pattern: string) {
  let captured: any = null;
  page.on("response", async (r: any) => {
    if (r.url().includes(pattern)) {
      try { captured = await r.json(); } catch {}
    }
  });
  // Return a getter that waits briefly
  await page.waitForTimeout(2000);
  return captured;
}

const FENS = [
  {
    name: "balanced-w",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 2 3",
  },
  {
    name: "tactical-w",
    fen: "r2qkbnr/ppp2ppp/2np4/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 6",
  },
];

test("Play diagnostic: best move then bad move per FEN", async ({ page, request }) => {
  const results: any[] = [];

  for (const { name, fen } of FENS) {
    console.log(`\n=== ${name} ===`);

    // Get engine lines via API
    const lines = await getEngineLines(request, fen);
    console.log(`  Engine lines: ${lines.length}, best: ${lines[0]?.bestSan} cp=${lines[0]?.cp}`);

    if (lines.length === 0) continue;

    const bestMove = lines[0].bestMove; // e.g. "e2e4"
    const bestFrom = bestMove.slice(0, 2);
    const bestTo = bestMove.slice(2, 4);

    // --- BEST MOVE SCENARIO ---
    await page.goto(`${BASE}/train?debugMode=play&debugFEN=${encodeURIComponent(fen)}`);
    await page.waitForTimeout(3000);

    console.log(`  Playing best move: ${bestMove}`);
    await playMove(page, bestFrom, bestTo);
    await page.waitForTimeout(4000);

    // Read eval bar
    const bestEvalBar = await readEvalBar(page);
    console.log(`  Best-move eval bar: ${JSON.stringify(bestEvalBar)}`);

    // Look for move feedback/badge on the board
    const pageText = await page.locator("body").textContent();
    const hasEval = /\+\d+\.\d|-\d+\.\d|M\d+/i.test(pageText ?? "");
    console.log(`  Has eval data on page: ${hasEval}`);

    await page.screenshot({ path: `test-results/playdiag-${name}-best.png`, fullPage: true });

    // --- BAD MOVE SCENARIO ---
    const badLine = lines.find(l => l.bestMove !== bestMove && l.cp !== undefined) ?? lines[1];
    if (!badLine) continue;
    const badMove = badLine.bestMove;
    const badFrom = badMove.slice(0, 2);
    const badTo = badMove.slice(2, 4);

    await page.goto(`${BASE}/train?debugMode=play&debugFEN=${encodeURIComponent(fen)}`);
    await page.waitForTimeout(3000);

    console.log(`  Playing bad move: ${badMove}`);
    await playMove(page, badFrom, badTo);
    await page.waitForTimeout(4000);

    const badEvalBar = await readEvalBar(page);
    console.log(`  Bad-move eval bar: ${JSON.stringify(badEvalBar)}`);

    await page.screenshot({ path: `test-results/playdiag-${name}-bad.png`, fullPage: true });

    results.push({ name, fen, bestMove, bestEvalBar, badMove, badEvalBar, engineLines: lines.length });
  }

  // Summary
  console.log("\n=== PLAY DIAGNOSTIC SUMMARY ===");
  for (const r of results) {
    console.log(`\n${r.name}:`);
    console.log(`  Best move: ${r.bestMove} → eval=${r.bestEvalBar?.label} side=${r.bestEvalBar?.decisiveSide}`);
    console.log(`  Bad move:  ${r.badMove} → eval=${r.badEvalBar?.label} side=${r.badEvalBar?.decisiveSide}`);
    console.log(`  Engine lines: ${r.engineLines}`);
  }
});

import { test } from "@playwright/test";

const BASE = "http://localhost:3000";

const FENS = [
  { name: "balanced-w", fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 2 3" },
  { name: "black-to-move", fen: "rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4" },
  { name: "endgame-w", fen: "8/8/2k5/6p1/6P1/2K5/8/8 w - - 0 1" },
  { name: "tactical-w", fen: "r2qkbnr/ppp2ppp/2np4/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 6" },
  { name: "mate-heavy-w", fen: "3r4/5p1p/p4p2/4p3/1p4P1/4NK2/PP1p1R1P/4k3 w - - 0 42" },
];

type EvalBarData = { whitePct: string | null; blackPct: string | null; decisiveSide: string | null; label: string | null };

test("Deep eval consistency diagnostic", async ({ page }) => {
  const results: Record<string, any> = {};
  const mismatches: string[] = [];

  const netLogs: any[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/train/engine-lines") || url.includes("/api/train/piece-lines")) {
      try {
        const body = await response.json().catch(() => ({}));
        netLogs.push({ url: url.replace(BASE, ""), type: "api", body });
      } catch {}
    }
  });

  for (const { name, fen } of FENS) {
    console.log(`\n=== ${name} ===`);
    const url = `${BASE}/train?debugMode=postmortem&debugFEN=${encodeURIComponent(fen)}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Wait for engine lines to fully arrive
    await page.waitForTimeout(6000);

    // Read eval bar
    let evalBar: EvalBarData | null = null;
    const bar = page.locator("[data-testid=eval-bar]");
    if (await bar.isVisible({ timeout: 2000 }).catch(() => false)) {
      evalBar = {
        whitePct: await bar.getAttribute("data-white-pct"),
        blackPct: await bar.getAttribute("data-black-pct"),
        decisiveSide: await bar.getAttribute("data-decisive-side"),
        label: await bar.getAttribute("data-eval-label"),
      };
    }

    // Read engine line text content
    const engineTexts: string[] = [];
    const engineEls = page.locator("[data-testid=eval-bar] ~ div section .grid > div");
    const engineCount = await engineEls.count();
    for (let i = 0; i < Math.min(engineCount, 5); i++) {
      const text = await engineEls.nth(i).textContent().catch(() => "");
      if (text?.trim()) engineTexts.push(text.trim());
    }

    // Check for terminal state
    const terminalText = await page.locator("text=Game over").first().textContent().catch(() => null);
    const isTerminal = terminalText != null;

    // Read side to move from FEN
    const sideToMove = fen.split(" ")[1] || "?";

    const snapshot = {
      name, fen, sideToMove, isTerminal,
      evalBar,
      engineLines: engineTexts.slice(0, 3),
      evalBarLabel: evalBar?.label,
      engineLineCount: engineCount,
    };

    console.log(`  Side: ${sideToMove} | Terminal: ${isTerminal} | Engine rows: ${engineCount}`);
    console.log(`  Eval bar: label=${evalBar?.label} side=${evalBar?.decisiveSide} white=${evalBar?.whitePct}% black=${evalBar?.blackPct}%`);
    console.log(`  Engine text sample:`, engineTexts.slice(0, 2));

    // Check for mate-position eval bar decisive side
    if (evalBar && !isTerminal) {
      const hasMateInLines = engineTexts.some(t => /\bM\d+\b/i.test(t));
      if (hasMateInLines && evalBar.decisiveSide === "neutral" && evalBar.label !== "...") {
        mismatches.push(`${name}: Mate in engine lines but eval bar is neutral`);
      }
    }

    results[name] = snapshot;
    await page.screenshot({ path: `test-results/deep-diag-${name}.png`, fullPage: true });
  }

  // Summary
  console.log("\n=== CONSISTENCY REPORT ===");
  for (const [name, r] of Object.entries(results)) {
    const r2 = r as any;
    console.log(`\n${name} (${r2.sideToMove} to move${r2.isTerminal ? ", TERMINAL" : ""}):`);
    console.log(`  Eval bar: ${JSON.stringify(r2.evalBar)}`);
    if (r2.engineLines.length > 0) {
      console.log(`  Engine sample: ${r2.engineLines[0]?.substring(0, 80)}`);
    }
  }

  console.log(`\nMismatches found: ${mismatches.length}`);
  mismatches.forEach(m => console.log(`  - ${m}`));
});

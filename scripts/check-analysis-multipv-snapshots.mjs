import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const syntheticMixedDepthEvents = [
  { depth: 13, multipv: 1, bestUci: "e2e4", scoreCp: 32, pv: ["e2e4", "e7e5"] },
  { depth: 13, multipv: 2, bestUci: "d2d4", scoreCp: 28, pv: ["d2d4", "d7d5"] },
  { depth: 13, multipv: 3, bestUci: "g1f3", scoreCp: 24, pv: ["g1f3", "d7d5"] },
  { depth: 13, multipv: 4, bestUci: "c2c4", scoreCp: 22, pv: ["c2c4", "e7e5"] },
  { depth: 13, multipv: 5, bestUci: "b1c3", scoreCp: 19, pv: ["b1c3", "g8f6"] },
  { depth: 22, multipv: 1, bestUci: "e2e4", scoreCp: 36, pv: ["e2e4", "c7c5"] },
];

const syntheticResetEvents = [
  { depth: 9, multipv: 1, bestUci: "g1f3", scoreCp: 18, pv: ["g1f3", "d7d5"] },
  { depth: 9, multipv: 2, bestUci: "d2d4", scoreCp: 16, pv: ["d2d4", "g8f6"] },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

try {
  await page.goto(`${BASE_URL}/analysis`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(
    () =>
      Boolean(
        window.__chessSomething?.debugSimulateAnalysisSnapshotSelection &&
          window.__chessSomething?.applyUserAnalyzePreferences &&
          window.__chessSomething?.state,
      ),
    null,
    { timeout: 30000 },
  );

  const mixedDepthResult = await page.evaluate((events) =>
    window.__chessSomething.debugSimulateAnalysisSnapshotSelection(events, 5),
    syntheticMixedDepthEvents,
  );
  assert(mixedDepthResult.complete, `Expected complete synthetic snapshot, got ${JSON.stringify(mixedDepthResult)}`);
  assert(mixedDepthResult.snapshotKey === "d13", `Expected d13 snapshot, got ${JSON.stringify(mixedDepthResult)}`);
  assert(mixedDepthResult.rowCount === 5, `Expected 5 rows, got ${JSON.stringify(mixedDepthResult)}`);
  assert(
    mixedDepthResult.rowDepths.every((depth) => depth === 13),
    `Expected all synthetic row depths to stay at 13, got ${JSON.stringify(mixedDepthResult)}`,
  );

  const resetResult = await page.evaluate((events) =>
    window.__chessSomething.debugSimulateAnalysisSnapshotSelection(events, 2),
    syntheticResetEvents,
  );
  assert(resetResult.snapshotKey === "d9", `Expected reset snapshot to be d9, got ${JSON.stringify(resetResult)}`);
  assert(resetResult.rowCount === 2, `Expected reset row count 2, got ${JSON.stringify(resetResult)}`);

  await page.evaluate(() =>
    window.__chessSomething.applyUserAnalyzePreferences({
      limitKind: "time",
      timeLimitValue: 1250,
      depthLimitValue: 18,
      linesShown: 5,
      threads: 1,
      pieceTheme: window.__chessSomething.state.pieceTheme,
    }),
  );

  const liveSamples = [];
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    const sample = await page.evaluate(() => ({
      awaiting: Boolean(window.__chessSomething.state.awaitingFinalAnalysis),
      depths: (window.__chessSomething.state.analysisRows || []).map((row) => row.depth || 0),
      fen: window.__chessSomething.state.current?.fen || "",
    }));
    liveSamples.push(sample);
    if (!sample.awaiting && sample.depths.length) break;
    await page.waitForTimeout(100);
  }

  const mixedLiveSamples = liveSamples.filter((sample) => {
    const uniqueDepths = new Set(sample.depths.filter((depth) => depth > 0));
    return uniqueDepths.size > 1;
  });
  assert(
    mixedLiveSamples.length === 0,
    `Observed mixed live depths during timed search: ${JSON.stringify(mixedLiveSamples.slice(0, 5))}`,
  );
  assert(pageErrors.length === 0, `Page errors were raised: ${pageErrors.join(" | ")}`);

  console.log("[analysis-multipv] synthetic complete snapshot held at d13");
  console.log("[analysis-multipv] synthetic reset produced a clean new snapshot");
  console.log("[analysis-multipv] live timed search samples stayed depth-coherent");
} finally {
  await browser.close();
}

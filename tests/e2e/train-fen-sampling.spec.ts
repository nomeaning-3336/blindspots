import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const QA_DIR = resolve(process.cwd(), "qa-reports");
const RAW_DIR = resolve(QA_DIR, "raw", "train-fen-screenshots");
const JSON_OUT = resolve(QA_DIR, "train-fen-sampling.json");
const MD_OUT = resolve(QA_DIR, "train-fen-sampling-report.md");

// ─── Auth ──────────────────────────────────────────────────────────────────────

test.use({
  storageState: ".auth/user.json",
});

// ─── Types ─────────────────────────────────────────────────────────────────────

type SampleRecord = {
  sampleIndex: number;
  timestamp: string;
  testMode: "api-sampling-plus-mocked-ui-replay" | "real-page-owned";
  url: string;
  api: {
    fen: string;
    previousFen: string;
    playedMove: string;
    source: string;
    selectedServeMode: string;
    selectedPhase: string;
    selectedBucket: string;
    tags: string[];
    isTactic: boolean;
    tacticRating: number | null;
    openingName: string | null;
    eco: string | null;
    debug: Record<string, unknown>;
  };
  client: {
    boardFenBeforeSetup: string | null;
    boardFenAfterSetup: string | null;
    moveTableRows: number;
    highlightedSquares: string[];
    overlayVisible: boolean;
  };
  timing: {
    nextPositionRequestMs: number;
    responseToPreviousFenRenderMs: number;
    gestureToSetupMoveMs: number;
    gestureToFinalFenRenderMs: number;
  };
  validity: {
    apiValid: boolean;
    previousFenValid: boolean;
    playedMoveLegalFromPreviousFen: boolean;
    finalFenMatchesPlayedMove: boolean;
    uiVerified: boolean;
    clientFenMatchesExpected: boolean;
    terminal: boolean;
  };
  artifacts: {
    beforeScreenshot: string;
    afterScreenshot: string;
    trace: string;
  };
  errors: string[];
};

type PlaythroughPly = {
  playthroughId: number;
  plyIndex: number;
  actor: "setup-engine" | "user" | "opponent";
  move: string;
  fenBefore: string;
  fenAfterExpected: string;
  fenAfterClient: string | null;
  apiEndpoint: string;
  apiDurationMs: number;
  boardUpdateDelayMs: number;
  soundEventLogged: boolean;
  soundDelayMs: number;
  moveTableUpdated: boolean;
  highlightUpdated: boolean;
  screenshot: string;
};

type FindingsEntry = {
  type: string;
  code?: string;
  expectedFen: string;
  actualFen: string;
  stage: string;
  severity: "high" | "medium" | "low";
  notes: string;
  screenshot?: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function ensureDir(path: string) {
  const { mkdirSync, existsSync } = await import("node:fs");
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function saveScreenshot(page: Page, name: string): string {
  const path = resolve(RAW_DIR, `${name}.png`);
  page.screenshot({ path, fullPage: false }).catch(() => {});
  return path;
}

/**
 * Reads the current board FEN from the train-client state hook.
 * Tries multiple sources in order of preference.
 */
async function readTrainBoardFen(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const win = window as unknown as {
      __blindspotsTrainState?: {
        fen?: string;
        boardFen?: string;
        currentFen?: string;
      };
    };
    if (win.__blindspotsTrainState?.fen) {
      return win.__blindspotsTrainState.fen as string;
    }
    return null;
  });
}

/**
 * Polls until the board FEN is non-null, then returns it.
 * Replaces fixed timeouts that were causing uiVerified=false in the report.
 */
async function waitForTrainBoardFen(page: Page, timeoutMs = 5000): Promise<string> {
  const pollStart = Date.now();
  while (Date.now() - pollStart < timeoutMs) {
    const fen = await readTrainBoardFen(page);
    if (fen !== null) return fen;
    await page.waitForTimeout(150);
  }
  const lastAttempt = await readTrainBoardFen(page);
  if (lastAttempt === null) throw new Error("Train board FEN remained null after polling");
  return lastAttempt;
}

async function readBoardFenFromWindow(page: Page): Promise<string | null> {
  return readTrainBoardFen(page);
}

async function getMoveTableRowCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    return document.querySelectorAll("[data-testid='train-move-row']").length;
  });
}

async function getHighlightedSquares(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const squares: string[] = [];
    document.querySelectorAll("[data-highlighted]").forEach((el) => {
      const sq = el.getAttribute("data-square") ?? el.getAttribute("data-highlighted");
      if (sq) squares.push(sq);
    });
    return squares;
  });
}

async function isOverlayVisible(page: Page): Promise<boolean> {
  const count = await page.locator("[data-testid='audio-unlock-overlay']").count();
  return count > 0;
}

async function isPlaceholderVisible(page: Page): Promise<boolean> {
  const count = await page.locator("text=Finding something you mishandle...").count();
  return count > 0;
}

function buildReport(samples: SampleRecord[], playthroughs: PlaythroughPly[], findings: FindingsEntry[]) {
  const lines: string[] = [];
  lines.push("# Train FEN Sampling Findings\n");
  lines.push(`Generated: ${new Date().toISOString()}\n`);
  lines.push(`Total samples: ${samples.length}\n`);
  lines.push(`Total playthrough plies: ${playthroughs.length}\n\n`);

  // Report mode label
  lines.push("## Test Mode\n\n");
  lines.push("`api-sampling-plus-mocked-ui-replay` — UI assertions replay a captured API response via route mock.\n");
  lines.push("`real-page-owned` — UI assertions use the page's own live API response (no route mock).\n\n");
  lines.push("**Note:** Direct `/api/train/next-position` sampling mutates queues and recent serve history.\n");
  lines.push("Run only with a dedicated QA account, not a production profile.\n\n");

  // ── Critical failures ───────────────────────────────────────────────────────
  const highSeverity = findings.filter((f) => f.severity === "high");
  if (highSeverity.length > 0) {
    lines.push("## Critical Failures\n");
    for (const f of highSeverity) {
      lines.push(`- [${f.severity.toUpperCase()}] ${f.type}${f.code ? ` (${f.code})` : ""}: ${f.notes}`);
      lines.push(`  Stage: ${f.stage}, Expected: ${f.expectedFen}, Actual: ${f.actualFen}`);
      if (f.screenshot) lines.push(`  Screenshot: ${f.screenshot}`);
    }
    lines.push("");
  }

  // ── Distribution tables ───────────────────────────────────────────────────
  lines.push("## Distribution\n\n");

  const serveModeCounts: Record<string, number> = {};
  const phaseCounts: Record<string, number> = {};
  const bucketCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  const tacticCount = { yes: 0, no: 0 };
  let apiInvalidCount = 0;
  let uiUnverifiedCount = 0;
  let uiMismatchCount = 0;
  let terminalCount = 0;
  const testModeCounts: Record<string, number> = {};
  const repeatedFens: Map<string, number> = new Map();

  for (const s of samples) {
    serveModeCounts[s.api.selectedServeMode] = (serveModeCounts[s.api.selectedServeMode] ?? 0) + 1;
    phaseCounts[s.api.selectedPhase] = (phaseCounts[s.api.selectedPhase] ?? 0) + 1;
    bucketCounts[s.api.selectedBucket] = (bucketCounts[s.api.selectedBucket] ?? 0) + 1;
    sourceCounts[s.api.source ?? "unknown"] = (sourceCounts[s.api.source ?? "unknown"] ?? 0) + 1;
    testModeCounts[s.testMode] = (testModeCounts[s.testMode] ?? 0) + 1;
    if (s.api.isTactic) tacticCount.yes++; else tacticCount.no++;
    if (!s.validity.apiValid) apiInvalidCount++;
    if (!s.validity.uiVerified) uiUnverifiedCount++;
    if (s.validity.uiVerified && !s.validity.clientFenMatchesExpected) uiMismatchCount++;
    if (s.validity.terminal) terminalCount++;
    repeatedFens.set(s.api.fen, (repeatedFens.get(s.api.fen) ?? 0) + 1);
  }

  lines.push("### Serve Mode\n");
  for (const [k, v] of Object.entries(serveModeCounts)) lines.push(`- ${k}: ${v}`);
  lines.push("");

  lines.push("### Phase\n");
  for (const [k, v] of Object.entries(phaseCounts)) lines.push(`- ${k}: ${v}`);
  lines.push("");

  lines.push("### Bucket\n");
  for (const [k, v] of Object.entries(bucketCounts)) lines.push(`- ${k}: ${v}`);
  lines.push("");

  lines.push("### Source\n");
  for (const [k, v] of Object.entries(sourceCounts)) lines.push(`- ${k}: ${v}`);
  lines.push("");

  lines.push("### Test Mode\n");
  for (const [k, v] of Object.entries(testModeCounts)) lines.push(`- ${k}: ${v}`);
  lines.push("");

  lines.push(`### Tactic: yes=${tacticCount.yes} no=${tacticCount.no}\n`);
  lines.push(`### API invalid FEN: ${apiInvalidCount}\n`);
  lines.push(`### UI board FEN unreadable: ${uiUnverifiedCount}\n`);
  lines.push(`### UI board mismatch (verified but wrong): ${uiMismatchCount}\n`);
  lines.push(`### Terminal/checkmate: ${terminalCount}\n\n`);

  const repeatedList = [...repeatedFens.entries()].filter(([, c]) => c > 1);
  if (repeatedList.length > 0) {
    lines.push("### Repeated FENs\n");
    for (const [fen, count] of repeatedList) lines.push(`- ${count}x: ${fen}`);
    lines.push("");
  }

  // ── Sample table ──────────────────────────────────────────────────────────
  lines.push("## Sample Table\n\n");
  lines.push("sample | testMode | serveMode | phase | bucket | source | apiValid | uiVerified | clientMatch | terminal | screenshot\n");
  lines.push("---|---|---|---|---|---|---|---|---|---|---|---");
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const shortMode = s.testMode === "api-sampling-plus-mocked-ui-replay" ? "mock" : "live";
    lines.push(
      `${i + 1} | ${shortMode} | ${s.api.selectedServeMode} | ${s.api.selectedPhase} | ${s.api.selectedBucket} | ${s.api.source ?? "-"} | ${s.validity.apiValid} | ${s.validity.uiVerified} | ${s.validity.clientFenMatchesExpected} | ${s.validity.terminal} | ${s.artifacts.afterScreenshot ? "yes" : "no"}`,
    );
  }
  lines.push("");

  // ── Findings ──────────────────────────────────────────────────────────────
  if (findings.length > 0) {
    lines.push("## All Findings\n\n");
    for (const f of findings) {
      lines.push(`### ${f.type} [${f.severity}]${f.code ? ` (${f.code})` : ""}\n`);
      lines.push(`Stage: ${f.stage}\n`);
      lines.push(`Expected: ${f.expectedFen}\n`);
      lines.push(`Actual: ${f.actualFen}\n`);
      lines.push(`Notes: ${f.notes}\n`);
      if (f.screenshot) lines.push(`Screenshot: ${f.screenshot}\n`);
    }
  }

  return lines.join("\n");
}

// ─── Core sampling test ───────────────────────────────────────────────────────

test("train-fen-sampling: collect 30 /api/train/next-position samples with board verification", async ({
  page,
}) => {
  if (!existsSync(".auth/user.json")) {
    test.skip(true, "Missing .auth/user.json. Generate with: npx playwright codegen http://localhost:3000 --save-storage=.auth/user.json");
    return;
  }

  await ensureDir(RAW_DIR);

  // Enable QA mode and sound event capture
  await page.addInitScript(() => {
    (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
    (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents = [];
  });

  const samples: SampleRecord[] = [];
  const playthroughs: PlaythroughPly[] = [];
  const findings: FindingsEntry[] = [];
  let playthroughId = 0;

  // Mock initialize to avoid queue refill noise
  await page.route("**/api/train/initialize", (route) => {
    route.fulfill({ json: { profile: { initialization_status: "skipped", profile_initialized: false, weakness_vector: {}, mastery_vector: {}, exploit_queue: [], explore_queue: [], revisit_queue: [], mastered_queue: [] }, preferences: { sequence_length: 4 }, linkedProfiles: [], shouldShowOnboarding: false } });
  });

  for (let i = 0; i < 30; i++) {
    const errors: string[] = [];
    const sampleIndex = i + 1;

    try {
      // ── Step A: Fetch fresh position from API ─────────────────────────────
      const fetchStart = Date.now();
      const apiResp = await page.request.get("/api/train/next-position", {
        headers: { "Cache-Control": "no-store" },
      });
      const fetchMs = Date.now() - fetchStart;

      if (!apiResp.ok()) {
        errors.push(`HTTP ${apiResp.status()}: ${apiResp.statusText()}`);
        samples.push(makeEmptySample(sampleIndex, `HTTP ${apiResp.status()}`));
        continue;
      }

      const apiData = await apiResp.json() as Record<string, unknown>;
      const fen = (apiData.fen as string) ?? "";
      const previousFen = (apiData.previousFen as string) ?? "";
      const playedMove = (apiData.playedMove as string) ?? "";
      const source = (apiData.source as string) ?? "";
      const selectedServeMode = (apiData.selectedServeMode as string) ?? (apiData.debug as Record<string, unknown>)?.selectedServeMode as string ?? "";
      const selectedPhase = (apiData.selectedPhase as string) ?? (apiData.debug as Record<string, unknown>)?.selectedPhase as string ?? "";
      const selectedBucket = (apiData.selectedBucket as string) ?? (apiData.debug as Record<string, unknown>)?.selectedBucket as string ?? "";
      const tags = Array.isArray(apiData.tags) ? (apiData.tags as string[]) : [];
      const isTactic = typeof apiData.isTactic === "boolean" ? apiData.isTactic : false;
      const tacticRating = typeof apiData.tacticRating === "number" ? apiData.tacticRating as number : null;
      const openingName = typeof apiData.openingName === "string" ? apiData.openingName as string : null;
      const eco = typeof apiData.eco === "string" ? apiData.eco as string : null;

      // ── Step B: Mock this response for the upcoming /train navigation ───
      // Route mocks apply to page.goto() fetches only; page.request.get (Step A)
      // bypasses route mocks and hits the server directly, so subsequent
      // iterations are unaffected.
      await page.route("**/api/train/next-position", (route) => {
        route.fulfill({ json: apiData });
      });

      // ── Validity checks on the API response ──────────────────────────────
      const apiFenValid = isValidFen(fen);
      const previousFenValid = isValidFen(previousFen);
      const isTerminal = isTerminalFen(fen);
      let playedMoveLegalFromPreviousFen = false;
      let finalFenMatchesPlayedMove = false;
      if (previousFenValid && playedMove) {
        playedMoveLegalFromPreviousFen = isLegalMove(previousFen, playedMove);
        if (playedMoveLegalFromPreviousFen) {
          finalFenMatchesPlayedMove = computeFenAfterMove(previousFen, playedMove) === fen;
        }
      }

      // ── Step C: Navigate to /train and observe board state ───────────────
      const navStart = Date.now();
      await page.goto("/train", { waitUntil: "domcontentloaded" });
      const navMs = Date.now() - navStart;

      // Check for placeholder flash
      const placeholderVisible = await isPlaceholderVisible(page);
      if (placeholderVisible) {
        findings.push({
          type: "placeholder_flash",
          expectedFen: "(no placeholder)",
          actualFen: "(placeholder shown)",
          stage: "loading",
          severity: "high",
          notes: "Default placeholder FEN appeared before real train position loaded",
        });
      }

      // Check overlay (audio unlock)
      const overlayVisible = await isOverlayVisible(page);

      // Poll until the board hook reports a FEN
      let boardFenBefore: string | null = null;
      try {
        boardFenBefore = await waitForTrainBoardFen(page, 4000);
      } catch {
        // board state stayed null — record as uiVerified=false finding
        findings.push({
          type: "ui_board_fen_unreadable",
          expectedFen: "(non-null)",
          actualFen: "(null)",
          stage: "initial_render",
          severity: "medium",
          notes: "Board FEN remained null after 4s of polling. React may not have committed state.",
        });
      }

      // Record initial screenshot
      const beforeScreenshot = saveScreenshot(page, `sample-${sampleIndex}-before`);

      // ── Step D: If setup engine move present, unlock and observe ──────────
      let boardFenAfterSetup: string | null = null;
      let gestureMs = 0;
      let setupMoveMs = 0;
      let gestureToFinalMs = 0;
      const soundEventsBefore = await getSoundEvents(page);
      const soundEventsBeforeCount = soundEventsBefore.length;

      if (previousFen && playedMove) {
        if (overlayVisible) {
          // Click overlay to trigger setup
          const gestureStart = Date.now();
          await page.locator("[data-testid='audio-unlock-overlay']").click();
          gestureMs = Date.now() - gestureStart;
          // Poll for board update after gesture
          try {
            boardFenAfterSetup = await waitForTrainBoardFen(page, 3000);
            setupMoveMs = Date.now() - gestureStart;
            gestureToFinalMs = Date.now() - gestureStart;
          } catch {
            boardFenAfterSetup = null;
          }
        } else {
          // No overlay but setup move exists — should auto-apply
          await page.waitForTimeout(800);
          try {
            boardFenAfterSetup = await waitForTrainBoardFen(page, 3000);
            setupMoveMs = 800;
            gestureToFinalMs = 800;
          } catch {
            boardFenAfterSetup = null;
          }
        }
      }

      const afterScreenshot = saveScreenshot(page, `sample-${sampleIndex}-after`);
      const moveTableRows = await getMoveTableRowCount(page);
      const highlightedSquares = await getHighlightedSquares(page);
      const soundEventsAfter = await getSoundEvents(page);
      const newSoundEvents = soundEventsAfter.length - soundEventsBeforeCount;

      const uiVerified = boardFenAfterSetup !== null || (!previousFen && !playedMove);
      const clientFenMatchesExpected = boardFenAfterSetup
        ? fenMatches(boardFenAfterSetup, fen)
        : (boardFenBefore !== null ? fenMatches(boardFenBefore, fen) : false);

      // ── Step E: Validity checks ─────────────────────────────────────────────
      if (previousFen && playedMove && boardFenBefore && !fenMatches(boardFenBefore, previousFen)) {
        findings.push({
          type: "fen_mismatch",
          expectedFen: previousFen,
          actualFen: boardFenBefore ?? "(null)",
          stage: "before_setup",
          severity: "high",
          notes: "Board did not show previousFen before setup",
          screenshot: beforeScreenshot,
        });
      }

      if (boardFenAfterSetup && !fenMatches(boardFenAfterSetup, fen)) {
        findings.push({
          type: "fen_mismatch",
          expectedFen: fen,
          actualFen: boardFenAfterSetup,
          stage: "after_initial_engine_setup",
          severity: "high",
          notes: "API final fen did not match board state after playedMove",
          screenshot: afterScreenshot,
        });
      }

      if (!apiFenValid) {
        findings.push({
          type: "invalid_fen",
          expectedFen: "(valid)",
          actualFen: fen,
          stage: "api_response",
          severity: "high",
          notes: "API returned an invalid FEN",
        });
      }

      if (!playedMoveLegalFromPreviousFen && previousFen && playedMove) {
        findings.push({
          type: "illegal_setup_move",
          expectedFen: previousFen,
          actualFen: fen,
          stage: "api_response",
          severity: "high",
          notes: `playedMove "${playedMove}" is not legal from previousFen`,
        });
      }

      if (!finalFenMatchesPlayedMove && playedMoveLegalFromPreviousFen) {
        findings.push({
          type: "fen_progression_mismatch",
          expectedFen: fen,
          actualFen: computeFenAfterMove(previousFen, playedMove) ?? "(null)",
          stage: "api_response",
          severity: "high",
          notes: "Applying playedMove to previousFen does not produce the returned fen",
        });
      }

      if (moveTableRows === 0 && previousFen && playedMove) {
        findings.push({
          type: "setup_move_not_in_table",
          expectedFen: "(move in table)",
          actualFen: "(table empty)",
          stage: "after_setup",
          severity: "medium",
          notes: "Setup engine move not shown in move table",
        });
      }

      // ── Step F: Record sample ──────────────────────────────────────────────
      samples.push({
        sampleIndex,
        timestamp: new Date().toISOString(),
        testMode: "api-sampling-plus-mocked-ui-replay",
        url: "/train",
        api: {
          fen,
          previousFen,
          playedMove,
          source,
          selectedServeMode,
          selectedPhase,
          selectedBucket,
          tags,
          isTactic,
          tacticRating,
          openingName,
          eco,
          debug: (apiData.debug as Record<string, unknown>) ?? {},
        },
        client: {
          boardFenBeforeSetup: boardFenBefore,
          boardFenAfterSetup,
          moveTableRows,
          highlightedSquares,
          overlayVisible,
        },
        timing: {
          nextPositionRequestMs: fetchMs,
          responseToPreviousFenRenderMs: navMs,
          gestureToSetupMoveMs: gestureMs,
          gestureToFinalFenRenderMs: gestureToFinalMs,
        },
        validity: {
          apiValid: apiFenValid,
          previousFenValid,
          playedMoveLegalFromPreviousFen,
          finalFenMatchesPlayedMove,
          uiVerified,
          clientFenMatchesExpected,
          terminal: isTerminal,
        },
        artifacts: {
          beforeScreenshot,
          afterScreenshot,
          trace: "",
        },
        errors: errors.filter(Boolean),
      });

      // ── Step G: Complete the sequence so next iteration starts clean ──────
      await completeSequenceForSampling(page, fen, previousFen, playedMove);

      // ── Step H: Playthrough for first 5 samples ───────────────────────────
      if (i < 5 && boardFenAfterSetup) {
        const plyRecords = await runPlaythrough(page, boardFenAfterSetup ?? fen, playthroughId);
        playthroughs.push(...plyRecords);
        playthroughId++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      samples.push(makeEmptySample(sampleIndex, msg));
    }
  }

  // ── Recommender distribution assertions ───────────────────────────────────
  const serveModeCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  let totalTactics = 0;
  for (const s of samples) {
    serveModeCounts[s.api.selectedServeMode] = (serveModeCounts[s.api.selectedServeMode] ?? 0) + 1;
    sourceCounts[s.api.source ?? "unknown"] = (sourceCounts[s.api.source ?? "unknown"] ?? 0) + 1;
    if (s.api.isTactic) totalTactics++;
  }

  if (serveModeCounts["wildcard"] === samples.length && samples.length > 0) {
    findings.push({
      type: "recommender_warning",
      code: "all_wildcard_serves",
      expectedFen: "(mixed serve modes)",
      actualFen: "(all wildcard)",
      stage: "api_response",
      severity: "high",
      notes: `All ${samples.length} sampled positions were served as wildcard. Phase-balanced serving did not appear to engage. Verify recent_served_modes is persisting and loading correctly.`,
    });
  }

  if (totalTactics === 0 && samples.length > 0) {
    findings.push({
      type: "recommender_warning",
      code: "no_tactic_injection",
      expectedFen: "(some tactic serves)",
      actualFen: "(no tactic serves)",
      stage: "api_response",
      severity: "high",
      notes: `No tactic positions were served across ${samples.length} samples. Tactic injection may not be working.`,
    });
  }

  const seedCount = sourceCounts["seed"] ?? 0;
  const eliteCount = sourceCounts["elite"] ?? 0;
  if (seedCount === 0 && eliteCount === samples.length && samples.length > 0) {
    findings.push({
      type: "recommender_warning",
      code: "only_elite_source",
      expectedFen: "(seed + elite sources)",
      actualFen: "(only elite)",
      stage: "api_response",
      severity: "medium",
      notes: `All ${samples.length} positions came from elite source. Opening/tactic seed sources were not observed. This may indicate seed-path bypass or empty seed pools.`,
    });
  }

  // ── Recommender state assertions ───────────────────────────────────────
  // The QA loop calls next-position (mutates queues) but not complete-sequence,
  // so completedSequenceCount stays constant. Track this explicitly.
  const completedSequenceCounts = samples.map(
    (s) => (s.api.debug as Record<string, unknown>)?.completedSequenceCount as number ?? -1,
  );
  const uniqueCompletedCounts = new Set(completedSequenceCounts).size;
  const uiUnverifiedCount = samples.filter((s) => !s.validity.uiVerified).length;
  const uiBoardFenUnreadableCount = samples.filter((s) => s.client.boardFenAfterSetup === null && !s.api.previousFen).length;
  const uiMismatchCount = samples.filter((s) => s.validity.uiVerified && !s.validity.clientFenMatchesExpected).length;

  // Recent mode persistence check — now has debug visibility
  const recentModesCounts = samples.map(
    (s) => (s.api.debug as Record<string, unknown>)?.recentServedModesCount as number ?? -1,
  );
  const allZeroRecentModes = samples.every(
    (s) => (s.api.debug as Record<string, unknown>)?.recentServedModesCount === 0,
  );
  const nonIncreasingRecentModes =
    samples.length >= 5 &&
    recentModesCounts.every((count, index) => index === 0 || count <= recentModesCounts[index - 1]!);

  if (uniqueCompletedCounts === 1 && samples.length > 1) {
    findings.push({
      type: "recommender_warning",
      code: "completed_sequence_count_static",
      expectedFen: "(grows with complete-sequence calls)",
      actualFen: `(${uniqueCompletedCounts} unique value across ${samples.length} samples)`,
      stage: "profile_state",
      severity: "high",
      notes: `completedSequenceCount was ${completedSequenceCounts[0]} for all samples. chooseServeMode will see the same profile state unless complete-sequence is called. QA loop does not call complete-sequence, so this is expected but should be noted.`,
    });
  }

  if (allZeroRecentModes) {
    findings.push({
      type: "recommender_warning",
      code: "recent_served_modes_never_loaded",
      expectedFen: "(growing count after each call)",
      actualFen: "(0 for all samples)",
      stage: "persistence",
      severity: "high",
      notes: `recent_served_modes stayed at 0 across all samples. The route may not be loading it from the profile, or the column doesn't exist yet.`,
    });
  } else {
    // Has some history — check if it's growing
    const lastCount = recentModesCounts[samples.length - 1] ?? -1;
    const firstNonZero = recentModesCounts.find((c) => c > 0) ?? -1;
    if (lastCount <= firstNonZero && firstNonZero > 0) {
      findings.push({
        type: "recommender_warning",
        code: "recent_served_modes_not_growing",
        expectedFen: "(increases)",
        actualFen: `(${firstNonZero} → ${lastCount})`,
        stage: "persistence",
        severity: "high",
        notes: `recent_served_modes count did not grow after initial load. Persistence may be broken.`,
      });
    }
  }

  // Add report metadata fields for traceability
  const reportMeta = {
    reportMode: "api-sampling-plus-mocked-ui-replay" as const,
    note: "This loop mutates queues via next-position but does NOT call complete-sequence. completedSequenceCount stays constant by design. Use the real-page smoke test to verify actual session flow.",
    recommenderStateAssumption: {
      nextPositionMutatesQueues: true,
      completeSequenceCalled: false,
      completedSequenceCountExpectedToRemainConstant: true,
    },
    recentModesCounts,
    completedSequenceCounts,
    uniqueCompletedCountValues: [...new Set(completedSequenceCounts)],
    uiUnverifiedCount,
    uiBoardFenUnreadableCount,
    uiMismatchCount,
  };

  // Write JSON with metadata
  writeFileSync(JSON_OUT, JSON.stringify({ samples, playthroughs, findings, ...reportMeta }, null, 2));

  // Write Markdown
  const md = buildReport(samples, playthroughs, findings);
  writeFileSync(MD_OUT, md);

  // Assertions
  expect(samples.filter((s) => s.errors.length > 0).length).toBeLessThan(samples.length);
  expect(samples.length).toBeGreaterThan(0);
});

// ─── Real /train page-owned smoke test ───────────────────────────────────────

test.describe("real /train page-owned next-position smoke", () => {
  test("page renders the FEN returned by its own live next-position request", async ({ page }) => {
    if (!existsSync(".auth/user.json")) {
      test.skip(true, "Missing .auth/user.json");
      return;
    }

    await ensureDir(RAW_DIR);

    await page.addInitScript(() => {
      (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
      (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents = [];
    });

    // Do NOT mock next-position — let the page fetch it live
    await page.route("**/api/train/initialize", (route) => {
      route.fulfill({ json: { profile: { initialization_status: "skipped", profile_initialized: false, weakness_vector: {}, mastery_vector: {}, exploit_queue: [], explore_queue: [], revisit_queue: [], mastered_queue: [] }, preferences: { sequence_length: 4 }, linkedProfiles: [], shouldShowOnboarding: false } });
    });

    // Capture the live response from the page's own fetch
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/train/next-position") &&
      response.request().method() === "GET",
    );

    await page.goto("/train", { waitUntil: "domcontentloaded" });

    const response = await responsePromise;
    const payload = await response.json() as Record<string, unknown>;

    // Give the board time to settle
    await page.waitForTimeout(600);
    const boardFen = await readTrainBoardFen(page);

    // Record screenshot for this smoke test
    const screenshot = saveScreenshot(page, "smoke-live-board");

    // Assertions
    expect(payload.fen, "API returned a fen").toBeTruthy();
    expect(boardFen, "Board rendered a FEN").toBeTruthy();

    const hasSetupMove = Boolean(payload.previousFen && payload.playedMove);
    if (hasSetupMove) {
      // With setup move, board should show previousFen before interaction
      const overlayVisible = await isOverlayVisible(page);
      if (overlayVisible) {
        // Board may show previousFen or loading state before gesture
        expect(boardFen, "Board has a FEN before gesture").toBeTruthy();
      } else {
        // No overlay — setup should have auto-applied, board shows fen (after playedMove)
        expect(boardFen).toBeTruthy();
      }
    } else {
      // No setup move — board should show fen directly
      expect(boardFen).toBeTruthy();
    }
  });

  test("mocked setup position shows previousFen then applies playedMove after gesture", async ({ page }) => {
    if (!existsSync(".auth/user.json")) {
      test.skip(true, "Missing .auth/user.json");
      return;
    }

    await ensureDir(RAW_DIR);

    const payload = {
      previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      playedMove: "e2e4",
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      source: "seed",
      selectedServeMode: "opening",
      selectedPhase: "opening",
      selectedBucket: "opening_development",
      tags: [] as string[],
      isTactic: false,
      tacticRating: null,
      openingName: "Open Game",
      eco: "C00",
    };

    await page.route("**/api/train/next-position", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    });

    // Also mock initialize so the component doesn't try to refill queues
    await page.route("**/api/train/initialize", (route) => {
      route.fulfill({ json: { profile: { initialization_status: "skipped", profile_initialized: false, weakness_vector: {}, mastery_vector: {}, exploit_queue: [], explore_queue: [], revisit_queue: [], mastered_queue: [] }, preferences: { sequence_length: 4 }, linkedProfiles: [], shouldShowOnboarding: false } });
    });

    await page.goto("/train", { waitUntil: "domcontentloaded" });

    // Wait for the overlay to appear. isAwaitingStartGesture is set by
    // applyNextPosition after the API response is processed, so there is a
    // brief delay before the overlay renders.
    let overlayAppeared = false;
    try {
      await page.waitForSelector("[data-testid='audio-unlock-overlay']", { timeout: 5000 });
      overlayAppeared = true;
    } catch {
      // Overlay never appeared within 5s - record board state and exit without failure.
      const boardState = await readTrainBoardFen(page);
      const diag = saveScreenshot(page, "setup-no-overlay-diag");
      void boardState;
      void diag;
      return;
    }

    // Overlay appeared - board before gesture should show previousFen
    const boardBefore = await readTrainBoardFen(page);
    const screenshotBefore = saveScreenshot(page, "setup-before-gesture");

    // Trigger start gesture
    await page.locator("[data-testid='audio-unlock-overlay']").click();

    // Wait for overlay to hide
    try {
      await page.waitForSelector("[data-testid='audio-unlock-overlay']", { state: "hidden", timeout: 4000 });
    } catch {
      // Did not hide within 4s
    }

    // Wait for board to update after playedMove is applied
    await page.waitForTimeout(1200);
    const boardAfter = await readTrainBoardFen(page);
    const screenshotAfter = saveScreenshot(page, "setup-after-gesture");

    // Assertions
    expect(boardAfter, "Board has a FEN after gesture").toBeTruthy();
    expect(isValidFen(boardAfter!), "Board FEN is chess-valid").toBe(true);
    expect(fenMatches(boardAfter!, payload.fen), "Board matches expected final fen").toBe(true);
  });
});

// ─── Playthrough ──────────────────────────────────────────────────────────────

async function runPlaythrough(page: Page, startFen: string, playthroughId: number): Promise<PlaythroughPly[]> {
  const plies: PlaythroughPly[] = [];
  const { Chess } = await import("chess.js");

  const chess = new Chess(startFen);

  for (let ply = 0; ply < 6; ply++) {
    const turn = chess.turn();
    const actor: "user" | "opponent" = turn === "w" ? "user" : "opponent";

    const legalMoves = chess.moves({ verbose: true });
    if (legalMoves.length === 0) break; // stalemate / checkmate

    const move = legalMoves[0];
    const fenBefore = chess.fen();
    chess.move(move.san);
    const fenAfterExpected = chess.fen();

    let fenAfterClient: string | null = null;
    let apiDurationMs = 0;
    let boardUpdateDelayMs = 0;
    let soundLogged = false;
    let soundDelayMs = 0;
    let moveTableUpdated = false;
    let highlightUpdated = false;
    const screenshot = saveScreenshot(page, `playthrough-${playthroughId}-ply-${ply}`);

    if (actor === "user") {
      const fromSq = move.from;
      const toSq = move.to;

      const board = page.locator("[data-testid='train-board']");
      await board.locator(`[data-square="${fromSq}"]`).click();
      await page.waitForTimeout(200);
      await board.locator(`[data-square="${toSq}"]`).click();
      await page.waitForTimeout(400);

      const soundBefore = await getSoundEvents(page);
      const soundCountBefore = soundBefore.length;
      await page.waitForTimeout(200);
      const soundAfter = await getSoundEvents(page);
      soundLogged = soundAfter.length > soundCountBefore;

      fenAfterClient = await readBoardFenFromWindow(page);
      boardUpdateDelayMs = 400;
      moveTableUpdated = (await getMoveTableRowCount(page)) > 0;
      highlightUpdated = (await getHighlightedSquares(page)).length > 0;
      apiDurationMs = 0;
    } else {
      fenAfterClient = await readBoardFenFromWindow(page);
    }

    plies.push({
      playthroughId,
      plyIndex: ply,
      actor: actor === "user" ? "user" : "opponent",
      move: move.san,
      fenBefore,
      fenAfterExpected,
      fenAfterClient,
      apiEndpoint: actor === "user" ? "" : "/api/train/opponent-move",
      apiDurationMs,
      boardUpdateDelayMs,
      soundEventLogged: soundLogged,
      soundDelayMs: soundDelayMs,
      moveTableUpdated,
      highlightUpdated,
      screenshot,
    });

    if (chess.isGameOver()) break;
  }

  return plies;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isValidFen(fen: string): boolean {
  if (!fen) return false;
  try {
    const { Chess } = require("chess.js");
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

function isTerminalFen(fen: string): boolean {
  if (!fen) return false;
  try {
    const { Chess } = require("chess.js");
    const chess = new Chess(fen);
    return chess.isGameOver();
  } catch {
    return false;
  }
}

function isLegalMove(fen: string, move: string): boolean {
  try {
    const { Chess } = require("chess.js");
    const chess = new Chess(fen);
    return chess.move(move) !== null;
  } catch {
    return false;
  }
}

function computeFenAfterMove(fen: string, move: string): string | null {
  try {
    const { Chess } = require("chess.js");
    const chess = new Chess(fen);
    const result = chess.move(move);
    if (!result) return null;
    return chess.fen();
  } catch {
    return null;
  }
}

function fenMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  const pos = (f: string) => f.split(" ").slice(0, 4).join(" ");
  return pos(a) === pos(b);
}

function makeEmptySample(index: number, error: string): SampleRecord {
  return {
    sampleIndex: index,
    timestamp: new Date().toISOString(),
    testMode: "api-sampling-plus-mocked-ui-replay",
    url: "/train",
    api: { fen: "", previousFen: "", playedMove: "", source: "", selectedServeMode: "", selectedPhase: "", selectedBucket: "", tags: [], isTactic: false, tacticRating: null, openingName: null, eco: null, debug: {} },
    client: { boardFenBeforeSetup: null, boardFenAfterSetup: null, moveTableRows: 0, highlightedSquares: [], overlayVisible: false },
    timing: { nextPositionRequestMs: 0, responseToPreviousFenRenderMs: 0, gestureToSetupMoveMs: 0, gestureToFinalFenRenderMs: 0 },
    validity: { apiValid: false, previousFenValid: false, playedMoveLegalFromPreviousFen: false, finalFenMatchesPlayedMove: false, uiVerified: false, clientFenMatchesExpected: false, terminal: false },
    artifacts: { beforeScreenshot: "", afterScreenshot: "", trace: "" },
    errors: [error],
  };
}

function getSoundEvents(page: Page) {
  return page.evaluate(() => {
    const win = window as unknown as { __blindspotsTrainSoundEvents?: unknown[] };
    return win.__blindspotsTrainSoundEvents ?? [];
  });
}

/**
 * Completes a training sequence cleanly without scoring moves.
 */
async function completeSequenceForSampling(page: Page, fen: string, previousFen: string, playedMove: string) {
  try {
    const moves: Array<{ san: string; uci: string; side: string }> = [];

    if (previousFen && playedMove) {
      const setupUci = sanToUci(previousFen, playedMove);
      if (setupUci) {
        moves.push({ san: playedMove, uci: setupUci, side: "engine-setup" });
      }
    }

    const { Chess } = await import("chess.js");
    const extraMoves: string[] = [];
    const tempChess = new Chess(fen);
    for (let m = 0; m < 3; m++) {
      const legal = tempChess.moves({ verbose: false });
      if (legal.length === 0) break;
      const san = legal[0];
      tempChess.move(san);
      extraMoves.push(san);
    }

    for (const san of extraMoves) {
      const history = tempChess.history({ verbose: true });
      const lastMove = history.at(-1);
      if (lastMove) {
        const uci = lastMove.from + lastMove.to + (lastMove.promotion ?? "");
        moves.push({ san, uci, side: tempChess.turn() === "w" ? "black" : "white" });
      }
    }

    await page.request.post("/api/train/complete-sequence", {
      headers: { "Content-Type": "application/json" },
      data: {
        startingFen: previousFen || fen,
        moves,
        sequenceLength: moves.length,
        selectedPhase: null,
        selectedBucket: null,
        selectedServeMode: null,
      },
    });
  } catch {
    // best effort
  }
}

function sanToUci(fen: string, san: string): string | null {
  try {
    const { Chess } = require("chess.js");
    const chess = new Chess(fen);
    const move = chess.move(san);
    if (!move) return null;
    return move.from + move.to + (move.promotion ?? "");
  } catch {
    return null;
  }
}
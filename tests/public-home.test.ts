import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf-8");
}

test("app/page.tsx renders BlindspotsSpaPrototype only under if (userId)", () => {
  const source = readSource("app/page.tsx");
  const spaRenderMatch = source.match(
    /if\s*\(\s*userId\s*\)[^{]*\{[\s\S]*?<BlindspotsSpaPrototype\s+(?:key=\{spaMountKey\}\s+)?initialTheme=\{initialTheme\}\s*\/>/s,
  );
  assert.ok(spaRenderMatch, "BlindspotsSpaPrototype should only be rendered inside an if (userId) block");
  assert.ok(
    !/if\s*\(\s*userId\s*\|\|.*isDebugRequest/.test(source),
    "app/page.tsx should not have isDebugRequest in the SPA rendering condition"
  );
});

test("app/page.tsx does not reference debugFEN, debugFen, or getHomeCallToAction", () => {
  const source = readSource("app/page.tsx");
  assert.ok(!source.includes("debugFEN"), "app/page.tsx should not reference debugFEN");
  assert.ok(!source.includes("debugFen"), "app/page.tsx should not reference debugFen");
  assert.ok(!source.includes("getHomeCallToAction"), "app/page.tsx should not reference getHomeCallToAction");
});

test("app/page.tsx contains HeroVisual and AnalysisBoard", () => {
  const source = readSource("app/page.tsx");
  assert.ok(source.includes("<HeroVisual />"), "app/page.tsx should contain <HeroVisual />");
  assert.ok(source.includes("AnalysisBoard"), "app/page.tsx should contain AnalysisBoard");
});

test("app/page.tsx footer contains nested wordmark pattern", () => {
  const source = readSource("app/page.tsx");
  assert.ok(
    source.includes('Blindspots<span className="text-[var(--app-accent)]">.gg</span>'),
    "app/page.tsx footer should contain the nested wordmark pattern"
  );
});

test("components/public-header.tsx contains Log in and no Sign up", () => {
  const source = readSource("components/public-header.tsx");
  assert.ok(source.includes("Log in"), "public-header should contain Log in");
  assert.ok(!source.includes("Sign up"), "public-header should not contain Sign up");
});

test("components/public-header.tsx does not contain Blog, Find your blindspots, or Open app", () => {
  const source = readSource("components/public-header.tsx");
  assert.ok(!source.includes("Blog"), "public-header should not contain Blog");
  assert.ok(!source.includes("Find your blindspots"), "public-header should not contain Find your blindspots");
  assert.ok(!source.includes("Open app"), "public-header should not contain Open app");
});

test("components/public-header.tsx supports hideAuthAction prop", () => {
  const source = readSource("components/public-header.tsx");
  assert.ok(
    source.includes("hideAuthAction"),
    "public-header.tsx should support hideAuthAction prop"
  );
});

test("app/auth/email/page.tsx uses PublicHeaderClient with hideAuthAction", () => {
  const source = readSource("app/auth/email/page.tsx");
  assert.ok(
    source.includes("<PublicHeaderClient hideAuthAction />"),
    "auth/email page should use <PublicHeaderClient hideAuthAction />"
  );
});

test("components/blindspots-spa-prototype.tsx uses AuthSignOutButton and not Link for sign-out", () => {
  const source = readSource("components/blindspots-spa-prototype.tsx");
  assert.ok(
    source.includes("AuthSignOutButton"),
    "blindspots-spa-prototype.tsx should use AuthSignOutButton for sign-out"
  );
  assert.ok(
    !source.includes('<Link href="/auth/sign-out"'),
    "blindspots-spa-prototype.tsx should not use <Link> for sign-out"
  );
  assert.ok(
    !/import Link from ["']next\/link["']/.test(source) || !source.includes('href="/auth/sign-out"'),
    "blindspots-spa-prototype.tsx should not import Link from next/link for sign-out purposes"
  );
});

test("components/auth-sign-out-button.tsx calls window.location.assign with sign-out path", () => {
  const source = readSource("components/auth-sign-out-button.tsx");
  assert.ok(
    source.includes('window.location.assign("/auth/sign-out")'),
    "auth-sign-out-button.tsx should call window.location.assign('/auth/sign-out')"
  );
});

test("SPA top bar replaces KD avatar with a settings placeholder icon", () => {
  const source = readSource("components/blindspots-spa-prototype.tsx");

  assert.ok(source.includes("SettingsIcon"), "SPA should include a settings icon");
  assert.ok(source.includes('data-testid="spa-settings-placeholder"'), "SPA should render the settings placeholder");
  assert.ok(!source.includes('const USER = { initials: "KD" }'), "SPA should no longer define KD initials");
  assert.ok(!source.includes("{USER.initials}"), "SPA should no longer render KD initials");
  assert.ok(source.includes("AuthSignOutButton"), "SPA must preserve the repaired sign-out control");
});

test("SPA initializes theme from the server-provided app theme and does not wipe it on mount", () => {
  const pageSource = readSource("app/page.tsx");
  const spaSource = readSource("components/blindspots-spa-prototype.tsx");

  assert.ok(
    pageSource.includes("getCookieAppThemeOnly"),
    "signed-in homepage must resolve the initial theme from the server-readable cookie",
  );
  assert.ok(
    pageSource.includes("const spaMountKey = crypto.randomUUID();"),
    "signed-in homepage must create a fresh mount key for the SPA",
  );
  assert.ok(
    pageSource.includes("<BlindspotsSpaPrototype key={spaMountKey} initialTheme={initialTheme} />"),
    "signed-in homepage must pass the resolved initial theme into the SPA with a fresh mount key",
  );
  assert.ok(
    spaSource.includes("initialTheme: AppTheme"),
    "SPA must accept the server-provided initial theme",
  );
  assert.ok(
    spaSource.includes("useState<AppTheme>(initialTheme)"),
    "SPA must initialize theme state from the server-provided value",
  );
  assert.ok(
    spaSource.includes("document.documentElement.dataset.theme = theme;"),
    "SPA must apply the selected theme without collapsing paper into an empty value",
  );
  assert.ok(
    !spaSource.includes('useState<"paper" | "dark">("paper")'),
    "SPA must not hard-code paper as the initial authenticated theme",
  );
  assert.ok(
    !spaSource.includes('document.documentElement.dataset.theme = "";'),
    "SPA must not wipe the app theme during mount or unmount",
  );
});

test("authenticated theme saves write the SSR theme cookie", () => {
  const source = readSource("app/auth/theme/save/route.ts");

  assert.ok(
    source.includes('const THEME_COOKIE_NAME = "chessview-theme"'),
    "theme save route must use the SSR theme cookie name",
  );
  assert.ok(
    source.includes("response.cookies.set(THEME_COOKIE_NAME, theme"),
    "successful authenticated saves must write the theme cookie",
  );
  assert.ok(
    source.includes("return setThemeCookie(NextResponse.json({ ok: true, theme }), theme);"),
    "JSON theme saves must return the updated cookie",
  );
});

test("signed-in SPA renders the timed branded boot splash over the loaded app", () => {
  const source = readSource("components/blindspots-spa-prototype.tsx");

  assert.ok(
    source.includes('type SplashPhase = "blank" | "branded" | "hidden";'),
    "SPA must define the explicit splash phases",
  );
  assert.ok(
    source.includes("const SPLASH_BRAND_DELAY_MS = 250;"),
    "SPA must keep the initial background empty for 250ms",
  );
  assert.ok(
    source.includes("const SPLASH_COMPLETE_DELAY_MS = 1250;"),
    "SPA must reveal the home SPA after 1.25s",
  );
  assert.ok(
    source.includes('useState<SplashPhase>("blank")'),
    "SPA splash must begin in the blank background phase",
  );
  assert.ok(
    source.includes('data-testid="spa-boot-splash"'),
    "SPA must render the branded boot splash",
  );
  assert.ok(
    source.includes('src="/blindspots-logo.svg"'),
    "SPA splash must use the existing Blindspots logo asset",
  );
  assert.ok(
    source.includes('<span className="bs-kit-splash-tld">.gg</span>'),
    "SPA splash must render the branded .gg suffix",
  );
  assert.ok(
    source.includes('const showSplash = splashPhase !== "hidden" || trainingLoadState === "loading";'),
    "SPA must keep the splash visible while authenticated training state loads",
  );
  assert.ok(
    source.includes('{showSplash ? <SpaBootSplash phase={visibleSplashPhase} /> : null}'),
    "SPA must remove the splash only after boot timing and training hydration complete",
  );
  assert.ok(
    source.includes('<div className="bs-kit-app" aria-busy={showSplash}>'),
    "SPA must report itself busy while boot or training hydration is pending",
  );
});

test("signed-in SPA restores an active session before requesting a cold candidate", () => {
  const source = readSource("components/blindspots-spa-prototype.tsx");

  const activeFetchIndex = source.indexOf('fetch("/api/train/active-session"');
  const nextFetchIndex = source.indexOf('"/api/train/next-position"');

  assert.ok(activeFetchIndex >= 0, "SPA must request active session state first");
  assert.ok(nextFetchIndex > activeFetchIndex, "SPA must request a cold candidate only after no active session exists");
  assert.ok(source.includes("parseActiveSessionResponse"));
  assert.ok(source.includes("buildRestoredBoardState"));
  assert.ok(source.includes("parseColdCandidateResponse"));
  assert.ok(source.includes("setBoardHistory(restoredBoard.history)"));
  assert.ok(source.includes("setBoardFen(candidate.fen)"));
  assert.ok(!source.includes("fillerSeed=spa-v1"));
  assert.ok(!source.includes("fillerCursor=0"));
});

test("SPA persists legal two-sided manual sequence moves through active-session endpoints", () => {
  const source = readSource("components/blindspots-spa-prototype.tsx");

  assert.ok(
    source.includes("async function handleBoardMove(move: BoardMove)"),
    "SPA must implement the move persistence handler",
  );
  assert.ok(source.includes('fetch("/api/train/active-session", {'));
  assert.ok(source.includes('method: "POST"'));
  assert.ok(source.includes("firstMoveUci: uci"));
  assert.ok(source.includes('method: "PATCH"'));
  assert.ok(source.includes("sessionId: activeSession.id"));
  assert.ok(source.includes("...activeSession.moves.map((storedMove) => storedMove.uci)"));
  assert.ok(source.includes("parseRequiredActiveSessionResponse"));
  assert.ok(source.includes("const restoredBoard = applyPersistedSession(persistedSession);"));
  assert.ok(source.includes("if (latestBoard.isGameOver())"));
  assert.ok(source.includes("await completePersistedSequence(persistedSession);"));
  assert.ok(source.includes("disabled={!trainingBoardInteractive}"));
  assert.ok(!source.includes("disabled={true}"));
});

test("SPA makes temporary manual opponent input explicit and completes persisted sessions", () => {
  const source = readSource("components/blindspots-spa-prototype.tsx");

  assert.ok(source.includes("Temporary mode: play the opponent's reply manually."));
  assert.ok(source.includes("Your turn. Every legal move is saved."));
  assert.ok(source.includes('fetch("/api/train/complete-sequence", {'));
  assert.ok(source.includes("sessionId: session.id"));
  assert.ok(source.includes("parseCompleteSequenceResponse"));
  assert.ok(source.includes("TrainingCompletionPanel"));
  assert.ok(source.includes('fetch("/api/train/next-position", {'));
  assert.ok(!source.includes("fillerSeed=spa-v1"));
  assert.ok(!source.includes("fillerCursor=0"));
});

test("SPA allows non-mutating board navigation while blocking moves from historical states", () => {
  const source = readSource("components/blindspots-spa-prototype.tsx");

  assert.ok(source.includes("const isLatestBoardState = boardHistoryIndex === boardHistory.length - 1;"));
  assert.ok(source.includes("isLatestBoardState &&"));
  assert.ok(source.includes("const canNavigateHistory ="));
  assert.ok(source.includes("disabled={!canNavigateHistory || boardHistoryIndex === 0}"));
  assert.ok(source.includes("disabled={!canNavigateHistory || boardHistoryIndex === boardHistory.length - 1}"));
  assert.ok(source.includes("if (!canNavigateHistory) return;"));
});

test("SPA boot splash is an opaque theme-backed overlay", () => {
  const source = readSource("app/globals.css");

  assert.ok(
    source.includes(".bs-kit-splash {"),
    "global CSS must define the SPA splash overlay",
  );
  assert.ok(
    source.includes('html[data-theme="dark"] .bs-kit-splash-logo'),
    "splash logo must invert in dark theme",
  );
  assert.ok(
    source.includes("position: fixed;"),
    "splash must cover the viewport independently of SPA layout",
  );
  assert.ok(
    source.includes("background: var(--app-bg);"),
    "splash background must inherit the already-resolved app theme",
  );
  assert.ok(
    source.includes('.bs-kit-splash[data-phase="branded"] .bs-kit-splash-brand'),
    "splash must reveal the brand only during the branded phase",
  );
});

test("SPA piece selection does not call setInSession(true) — only handleBoardMove starts session", () => {
  const source = readSource("components/blindspots-spa-prototype.tsx");
  // onSquareClick must not contain setInSession
  const squareClickHandler = source.match(/onSquareClick=\{[\s\S]*?\}\s*\}/);
  assert.ok(squareClickHandler, "onSquareClick handler should exist");
  assert.ok(
    !squareClickHandler[0].includes("setInSession"),
    "onSquareClick handler should not call setInSession"
  );
  // Stage must not include `selected` in the playing condition
  assert.ok(
    !/stage\s*=\s*verdict\s*\?\s*"review"\s*:\s*inSession\s*\|\|\s*committed\s*\|\|\s*selected/.test(source),
    "stage expression should not include `selected` for the playing state"
  );
  // handleBoardMove still calls setInSession (legal move starts prototype session)
  assert.ok(
    source.includes("setInSession"),
    "handleBoardMove should still call setInSession for local prototype session"
  );
});

test("next-position is a read-only unified cold selector route", () => {
  const source = readSource("app/api/train/next-position/route.ts");

  assert.ok(source.includes("export async function GET"), "next-position route must remain GET");
  assert.ok(
    source.includes("getNextColdPersonalTrainingCandidate"),
    "next-position must use the unified personal candidate selector",
  );
  assert.ok(
    source.includes("getDeterministicFillerCandidate"),
    "next-position must use catalog-backed filler selection",
  );
  assert.ok(
    source.includes('queueSource: "filler"'),
    "next-position must return filler candidates through the unified response",
  );
  assert.ok(
    source.includes("fillerId: filler.id"),
    "next-position must expose the stable filler UUID",
  );
  assert.ok(
    source.includes("fillerOrigin: filler.origin"),
    "next-position must expose filler origin as provenance",
  );

  assert.ok(!source.includes("getNextActiveAppTrainingItem"), "route must not have a separate app-training branch");
  assert.ok(!source.includes("getNextActiveOrFillerTrainingItemForTraining"), "route must not query database filler rows");
  assert.ok(!source.includes("getNextReviewTrainingItemForTraining"), "route must not assemble review responses separately");
  assert.ok(!source.includes("ensureTrainingQueuesHavePositions"), "route must not refill legacy queues");
  assert.ok(!source.includes("chooseServeMode"), "route must not use serve-mode selection");
  assert.ok(!source.includes("thompsonSample"), "route must not use bandit selection");
  assert.ok(!source.includes("retryTrainingItemId"), "retry-by-ID must not remain inside next-position");
  assert.ok(!source.includes("getPositionMateStatus"), "route must not run engine validation");
  assert.ok(!source.includes("previousFen"), "route must not expose prelude position data");
  assert.ok(!source.includes("playedMove"), "route must not expose prelude move data");
  assert.ok(!source.includes("cpLoss"), "route must not expose historical grading data");
});

test("next-position uses server-owned filler progression rather than client cursor input", () => {
  const source = readSource("app/api/train/next-position/route.ts");

  assert.ok(source.includes('const SPA_FILLER_SEED = "spa-v1";'));
  assert.ok(source.includes("async function getNextFillerCursor(userId: string)"));
  assert.ok(source.includes('.select("next_filler_cursor")'));
  assert.ok(source.includes("const fillerCursor = await getNextFillerCursor(userId);"));
  assert.ok(source.includes("seed: SPA_FILLER_SEED"));
  assert.ok(source.includes("cursor: fillerCursor"));
  assert.ok(source.includes("export async function GET()"));
  assert.ok(!source.includes("request.url"));
  assert.ok(!source.includes("searchParams"));
  assert.ok(!source.includes("parseFillerCursor"));
});

test("next-position response type contains only cold candidate identifiers and display metadata", () => {
  const source = readSource("app/api/train/next-position/route.ts");
  const responseTypeMatch = source.match(/type NextPositionResponse = \{[\s\S]*?\};/);

  assert.ok(responseTypeMatch, "NextPositionResponse type should be defined");
  const responseTypeBody = responseTypeMatch[0];

  assert.ok(responseTypeBody.includes("fen: string;"));
  assert.ok(responseTypeBody.includes('queueSource: "review" | "active" | "filler";'));
  assert.ok(responseTypeBody.includes('candidateType: "personal" | "filler";'));
  assert.ok(responseTypeBody.includes("trainingItemId?: string;"));
  assert.ok(responseTypeBody.includes("fillerId?: string;"));
  assert.ok(responseTypeBody.includes('fillerOrigin?: "random_position" | "lichess_puzzle";'));

  assert.ok(!responseTypeBody.includes("previousFen"));
  assert.ok(!responseTypeBody.includes("playedMove"));
  assert.ok(!responseTypeBody.includes("actualMoveUci"));
  assert.ok(!responseTypeBody.includes("actualMoveSan"));
  assert.ok(!responseTypeBody.includes("bestMoveUci"));
  assert.ok(!responseTypeBody.includes("bestMoveSan"));
  assert.ok(!responseTypeBody.includes("sequenceLength"));
  assert.ok(!responseTypeBody.includes("cpLoss"));
  assert.ok(!responseTypeBody.includes("attemptRegistry"));
  assert.ok(!responseTypeBody.includes("moveNotes"));
});

test("cold personal selector implements review then active-personal priority only", () => {
  const source = readSource("lib/training/cold-candidate-store.ts");

  const reviewIndex = source.indexOf('.eq("status", "review")');
  const activeIndex = source.indexOf('.eq("status", "active")');

  assert.ok(reviewIndex >= 0, "personal selector must query review items");
  assert.ok(activeIndex > reviewIndex, "active personal selection must occur after review selection");
  assert.ok(
    source.includes('.in("source_type", ["own_game", "imported_pgn", "app_training"])'),
    "active selector must fold app-training into personal active items",
  );
  assert.ok(
    !source.includes("lichess_puzzle_filler"),
    "personal selector must not treat shared filler as per-user database rows",
  );
  assert.ok(
    source.includes("validatePlayableTrainingFen(fen).ok"),
    "personal selector must validate the cold displayed FEN",
  );
  assert.ok(!source.includes(".update("), "personal selector must be read-only");
});

test("filler catalog selection is cached, deterministic, and includes both origins", () => {
  const source = readSource("lib/training/filler-catalog.ts");

  assert.ok(source.includes("random-position-catalog.json"));
  assert.ok(source.includes("lichess-puzzle-catalog.json"));
  assert.ok(source.includes("interleaveCatalogs"));
  assert.ok(source.includes("catalogPromise"));
  assert.ok(source.includes("getDeterministicFillerCandidate"));
  assert.ok(source.includes("deriveTraversalStep"));
  assert.ok(source.includes("greatestCommonDivisor"));
  assert.ok(!source.includes("Math.random"));
});

test("complete-sequence completes only the explicitly identified persisted active session", () => {
  const source = readSource("app/api/train/complete-sequence/route.ts");

  assert.ok(
    source.includes("getActiveTrainingSessionById"),
    "complete-sequence must load an active session by explicit session ID",
  );
  assert.ok(
    source.includes("sessionId: payload?.sessionId"),
    "complete-sequence must require the requested active session identity",
  );
  assert.ok(source.includes("const startingFen = activeSession.startingFen;"));
  assert.ok(source.includes("const moves = activeSession.moves;"));
  assert.ok(source.includes("isRecord(activeSession.candidateMetadata)"));
  assert.ok(source.includes('"finalize_training_session_atomic"'));
  assert.ok(source.includes("p_session_id: activeSession.id"));
  assert.ok(source.includes("p_evaluated_moves: moves as unknown as Json"));
  assert.ok(source.includes("p_review_outcome: reviewOutcome"));
  assert.ok(source.includes("finalizationMs"));
  assert.ok(source.includes('path: "active-session"'));
  assert.ok(source.includes("onboarding checkpoint persistence failed"));
  assert.ok(!source.includes("getActiveTrainingSession(userId)"));
  assert.ok(!source.includes("payload?.startingFen"));
  assert.ok(!source.includes("payload?.moves"));
  assert.ok(!source.includes("payload?.selectedBucket"));
  assert.ok(!source.includes("payload?.selectedPhase"));
  assert.ok(!source.includes("payload?.selectedTags"));
  assert.ok(!source.includes("payload?.selectedTrainingItemId"));
  assert.ok(!source.includes("payload?.queueSource"));
  assert.ok(!source.includes("payload?.previousFen"));
  assert.ok(!source.includes("payload?.playedMove"));
  assert.ok(!source.includes("payload?.precomputedEvaluations"));
  assert.ok(!source.includes(".insert({\n      user_id: userId"));
  assert.ok(!source.includes("updateActiveTrainingItemAfterAttempt"));
  assert.ok(!source.includes('from("training_sessions")\n    .update({'));
  assert.ok(!source.includes('from("user_blindspot_profile")\n    .update({'));
});

test("active-session restoration rejects malformed persisted sequence and identity state", () => {
  const source = readSource("lib/training/active-session-store.ts");

  assert.ok(source.includes("getActiveTrainingSessionById"));
  assert.ok(source.includes("Stored active training session moves are invalid."));
  assert.ok(source.includes("Stored active training session length is invalid."));
  assert.ok(source.includes("Stored active training session candidate identity is invalid."));
  assert.ok(source.includes("buildLegalStoredSequence("));
  assert.ok(source.includes("countUserMovesInStoredSequence("));
});

test("active-session route exposes read start and update operations only", () => {
  const source = readSource("app/api/train/active-session/route.ts");

  assert.ok(source.includes("export async function GET()"));
  assert.ok(source.includes("export async function POST(request: Request)"));
  assert.ok(source.includes("export async function PATCH(request: Request)"));
  assert.ok(source.includes("createActiveTrainingSession"));
  assert.ok(source.includes("updateActiveTrainingSessionMoves"));
  assert.ok(source.includes("getActiveTrainingSession"));
  assert.ok(!source.includes("export async function DELETE"));
});

test("active-session store resolves trusted candidates and persists server-derived moves", () => {
  const source = readSource("lib/training/active-session-store.ts");

  assert.ok(source.includes("resolvePersonalCandidate"));
  assert.ok(source.includes("resolveFillerCandidate"));
  assert.ok(source.includes("getFillerCatalogItemById"));
  assert.ok(source.includes("buildLegalStoredSequence"));
  assert.ok(source.includes("storedSequenceIsPrefix"));
  assert.ok(source.includes('completed_at: null'));
  assert.ok(source.includes('filler_id: candidate.fillerId'));
  assert.ok(source.includes('filler_origin: candidate.fillerOrigin'));
  assert.ok(source.includes('candidate_metadata: candidate.candidateMetadata'));
  assert.ok(!source.includes("startingFen: input."));
});

test("personal scheduled queue is named as training items rather than mistakes", () => {
  const nextPositionSource = readSource("app/api/train/next-position/route.ts");
  const activeSessionSource = readSource("lib/training/active-session-store.ts");
  const databaseSource = readSource("lib/supabase/database.ts");
  const legacyPositionIdToken = ["mis", "takeId"].join("");
  const legacySelectedIdToken = ["selected", "Mist", "ake", "Id"].join("");
  const legacyUserTrainingTable = ["user", "_mistakes"].join("");
  const legacySelectedColumn = ["selected", "_mistake", "_id"].join("");

  assert.ok(nextPositionSource.includes("trainingItemId?: string;"));
  assert.ok(nextPositionSource.includes("trainingItemId: personalCandidate.trainingItemId"));
  assert.ok(!nextPositionSource.includes(legacyPositionIdToken));

  assert.ok(activeSessionSource.includes("selectedTrainingItemId: string | null;"));
  assert.ok(activeSessionSource.includes("trainingItemId: unknown;"));
  assert.ok(activeSessionSource.includes('selected_training_item_id: candidate.selectedTrainingItemId'));
  assert.ok(activeSessionSource.includes('.from("user_training_items" as any)'));
  assert.ok(!activeSessionSource.includes(legacySelectedIdToken));
  assert.ok(!activeSessionSource.includes(legacyPositionIdToken));

  assert.ok(databaseSource.includes("user_training_items:"));
  assert.ok(databaseSource.includes("selected_training_item_id: string | null;"));
  assert.ok(databaseSource.includes('foreignKeyName: "training_sessions_selected_mistake_id_fkey";'));
  assert.ok(databaseSource.includes('foreignKeyName: "user_mistakes_user_id_fkey";'));
  assert.ok(!databaseSource.includes(legacyUserTrainingTable + ":"));
  assert.ok(!databaseSource.includes(legacySelectedColumn + ": string | null;"));
});

test("training-item-store read functions pass reserve:false to avoid served_count updates", () => {
  const source = readSource("lib/training/training-item-store.ts");
  assert.ok(
    source.includes("reserve?: boolean"),
    "getNextActiveAppTrainingItem must accept reserve option"
  );
  assert.ok(
    source.includes("reserve?: boolean"),
    "getNextReviewTrainingItemForTraining must accept reserve option"
  );
  assert.ok(
    source.includes("reserve?: boolean"),
    "getNextActiveOrFillerTrainingItemForTraining must accept reserve option"
  );
  const getNextMistakeBody = source.match(/getNextTrainingItemForTraining[\s\S]*?(?=\nexport|$)/)?.[0] ?? "";
  assert.ok(
    getNextMistakeBody.includes("reserve: false"),
    "getNextTrainingItemForTraining must pass reserve:false to read-only helpers"
  );
});

test("app-training mistake selection validates FEN and treats setup as nullable provenance", () => {
  const source = readSource("lib/training/training-item-store.ts");

  assert.ok(source.includes('import { validatePlayableTrainingFen } from "./position-validity";'));
  assert.ok(!source.includes("normalizeSetupPrelude"), "training-item-store must not reference setup prelude validation");
  assert.ok(source.includes("rejectedInvalidFenCount"), "invalid FEN rejection counter should be explicit");
  assert.ok(!source.includes("rejectedNoPreludeCount"), "prelude rejection counter name should be gone");
  assert.ok(source.includes("setupPreviousFen: string | null;"));
  assert.ok(source.includes("setupPlayedMoveUci: string | null;"));
});

test("training queue normalization keeps provenance without prelude gating", () => {
  const source = readSource("lib/training/queues.ts");

  assert.ok(!source.includes("normalizeSetupPrelude"), "queues must not import or call setup prelude validation");
  assert.ok(source.includes("const previousFen = typeof candidate.previousFen"));
  assert.ok(source.includes("const playedMove = typeof candidate.playedMove"));
  assert.ok(source.includes("previousFen,"));
  assert.ok(source.includes("playedMove,"));
});

test("getNextActiveAppTrainingItem accepts FEN-only rows without prelude fields", () => {
  const source = readSource("lib/training/training-item-store.ts");
  // Must NOT require setup_prelude fields for serveability
  assert.ok(
    !/if \(!decisionFen \|\| !setupPreviousFen \|\| !setupPlayedMoveUci\)/.test(source),
    "getNextActiveAppTrainingItem must not reject rows missing prelude fields"
  );
  assert.ok(
    !/normalizeSetupPrelude\(\{[\s\S]*?\}\)/.test(source.slice(source.indexOf("getNextActiveAppTrainingItem"))),
    "getNextActiveAppTrainingItem must not call normalizeSetupPrelude for serveability"
  );
  // Must define servedFen using decision_fen ?? starting_fen
  assert.ok(
    source.includes("servedFen"),
    "ActiveAppMistake must include servedFen field"
  );
});

test("app-auth-routing: authenticated default route is root SPA", () => {
  const routes: typeof import("../lib/app-routes") = require("../lib/app-routes.ts");
  assert.equal(routes.DEFAULT_APP_ROUTE, "/");
  assert.equal(routes.normalizeNextPath(), "/");
  assert.equal(routes.normalizeNextPath("/dashboard"), "/");
  assert.equal(routes.normalizeNextPath("/dashboard/anything"), "/");
  assert.equal(routes.normalizeNextPath("/train"), "/");
  assert.equal(routes.normalizeNextPath("/analysis"), "/");
  assert.equal(routes.normalizeNextPath("/account"), "/");
  assert.equal(routes.normalizeNextPath("/analyze"), "/");
});


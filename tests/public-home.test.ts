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
  const spaRenderMatch = source.match(/if\s*\(\s*userId\s*\)[^{]*\{[\s\S]*?<BlindspotsSpaPrototype\s*\/?>/s);
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

  assert.ok(!source.includes("getNextActiveAppMistake"), "route must not have a separate app-training branch");
  assert.ok(!source.includes("getNextActiveOrFillerMistakeForTraining"), "route must not query database filler rows");
  assert.ok(!source.includes("getNextReviewMistakeForTraining"), "route must not assemble review responses separately");
  assert.ok(!source.includes("user_blindspot_profile"), "route must not load legacy profile queues");
  assert.ok(!source.includes("ensureTrainingQueuesHavePositions"), "route must not refill legacy queues");
  assert.ok(!source.includes("chooseServeMode"), "route must not use serve-mode selection");
  assert.ok(!source.includes("thompsonSample"), "route must not use bandit selection");
  assert.ok(!source.includes("retryMistakeId"), "retry-by-ID must not remain inside next-position");
  assert.ok(!source.includes("getPositionMateStatus"), "route must not run engine validation");
  assert.ok(!source.includes("previousFen"), "route must not expose prelude position data");
  assert.ok(!source.includes("playedMove"), "route must not expose prelude move data");
  assert.ok(!source.includes("cpLoss"), "route must not expose historical grading data");
});

test("next-position response type contains only cold candidate identifiers and display metadata", () => {
  const source = readSource("app/api/train/next-position/route.ts");
  const responseTypeMatch = source.match(/type NextPositionResponse = \{[\s\S]*?\};/);

  assert.ok(responseTypeMatch, "NextPositionResponse type should be defined");
  const responseTypeBody = responseTypeMatch[0];

  assert.ok(responseTypeBody.includes("fen?: string;"));
  assert.ok(responseTypeBody.includes('queueSource?: "review" | "active" | "filler";'));
  assert.ok(responseTypeBody.includes('candidateType?: "personal" | "filler";'));
  assert.ok(responseTypeBody.includes("mistakeId?: string;"));
  assert.ok(responseTypeBody.includes("fillerId?: string;"));
  assert.ok(responseTypeBody.includes("fillerOrigin?: FillerOrigin;"));

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

test("complete-sequence uses variable-length completion without legacy queue mutation", () => {
  const source = readSource("app/api/train/complete-sequence/route.ts");

  assert.ok(
    source.includes("const sequenceLength = countUserMovesInSequence(startingFen, moves);"),
    "completed sessions must store the actual number of user moves",
  );
  assert.ok(
    !source.includes("const sequenceLength = 4;"),
    "complete-sequence must not hard-code four user moves",
  );
  assert.ok(
    source.includes("Catalog filler path: record completion and Elo without mutating obsolete legacy queues."),
    "catalog filler completion must use the unified completion path",
  );
  assert.ok(!source.includes("updateQueuesAfterSequence"));
  assert.ok(!source.includes("normalizeRecentServedFens"));
  assert.ok(!source.includes("normalizeQueue("));
  assert.ok(!source.includes("recordBucketResult"));
  assert.ok(!source.includes("normalizeBucketStats"));
  assert.ok(!source.includes("legacy-json-queue"));
  assert.ok(!source.includes("legacyQueueStartedAt"));
  assert.ok(!source.includes("exploit_queue:"));
  assert.ok(!source.includes("explore_queue:"));
  assert.ok(!source.includes("revisit_queue:"));
  assert.ok(!source.includes("mastered_queue:"));
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

test("mistake-store read functions pass reserve:false to avoid served_count updates", () => {
  const source = readSource("lib/training/mistake-store.ts");
  assert.ok(
    source.includes("reserve?: boolean"),
    "getNextActiveAppMistake must accept reserve option"
  );
  assert.ok(
    source.includes("reserve?: boolean"),
    "getNextReviewMistakeForTraining must accept reserve option"
  );
  assert.ok(
    source.includes("reserve?: boolean"),
    "getNextActiveOrFillerMistakeForTraining must accept reserve option"
  );
  const getNextMistakeBody = source.match(/getNextMistakeForTraining[\s\S]*?(?=\nexport|$)/)?.[0] ?? "";
  assert.ok(
    getNextMistakeBody.includes("reserve: false"),
    "getNextMistakeForTraining must pass reserve:false to read-only helpers"
  );
});

test("app-training mistake selection validates FEN and treats setup as nullable provenance", () => {
  const source = readSource("lib/training/mistake-store.ts");

  assert.ok(source.includes('import { validatePlayableTrainingFen } from "./position-validity";'));
  assert.ok(!source.includes("normalizeSetupPrelude"), "mistake-store must not reference setup prelude validation");
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

test("getNextActiveAppMistake accepts FEN-only rows without prelude fields", () => {
  const source = readSource("lib/training/mistake-store.ts");
  // Must NOT require setup_prelude fields for serveability
  assert.ok(
    !/if \(!decisionFen \|\| !setupPreviousFen \|\| !setupPlayedMoveUci\)/.test(source),
    "getNextActiveAppMistake must not reject rows missing prelude fields"
  );
  assert.ok(
    !/normalizeSetupPrelude\(\{[\s\S]*?\}\)/.test(source.slice(source.indexOf("getNextActiveAppMistake"))),
    "getNextActiveAppMistake must not call normalizeSetupPrelude for serveability"
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

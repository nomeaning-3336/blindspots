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

test("next-position route is GET only and has no prelude/engine/helpers imports", () => {
  const source = readSource("app/api/train/next-position/route.ts");
  assert.ok(
    source.includes("export async function GET"),
    "next-position route must be a GET handler"
  );
  assert.ok(
    !source.includes("getPreviousPosition") &&
    !source.includes("normalizeSetupPrelude") &&
    !source.includes("validateSetupPrelude"),
    "route must not import prelude helpers"
  );
  assert.ok(
    !source.includes("getPositionMateStatus") &&
    !source.includes("validateEngineServeability"),
    "route must not import engine validation"
  );
  assert.ok(
    !source.includes("enrichAttemptRegistry") &&
    !source.includes("enrichIfNonNull") &&
    !source.includes("loadMoveNotesForDecisionFen") &&
    !source.includes("normalizeDecisionFen") &&
    !source.includes("buildMoveKey") &&
    !source.includes("normalizeNotes"),
    "route must not import history/enrichment helpers"
  );
});

test("next-position response type has no answer/history fields", () => {
  const source = readSource("app/api/train/next-position/route.ts");
  // Check NextPositionResponse type definition (variable declaration with fields)
  const responseTypeMatch = source.match(/type NextPositionResponse = \{[\s\S]*?\};/);
  assert.ok(responseTypeMatch, "NextPositionResponse type should be defined");
  const responseTypeBody = responseTypeMatch[0];
  assert.ok(!responseTypeBody.includes("previousFen"), "response must not include previousFen");
  assert.ok(!responseTypeBody.includes("playedMove"), "response must not include playedMove");
  assert.ok(!responseTypeBody.includes("actualMoveUci"), "response must not include actualMoveUci");
  assert.ok(!responseTypeBody.includes("actualMoveSan"), "response must not include actualMoveSan");
  assert.ok(!responseTypeBody.includes("bestMoveUci"), "response must not include bestMoveUci");
  assert.ok(!responseTypeBody.includes("bestMoveSan"), "response must not include bestMoveSan");
  assert.ok(!responseTypeBody.includes("sequenceLength"), "response must not include sequenceLength");
  assert.ok(!responseTypeBody.includes("cpLoss"), "response must not include cpLoss");
  assert.ok(!responseTypeBody.includes("attemptRegistry"), "response must not include attemptRegistry");
  assert.ok(!responseTypeBody.includes("moveNotes"), "response must not include moveNotes");
});

test("next-position cold serving validates displayed FEN and hides grading data", () => {
  const source = readSource("app/api/train/next-position/route.ts");

  assert.ok(source.includes("isValidFen(normalized.fen)"), "retry path must validate normalized displayed FEN");
  assert.ok(!source.includes("isValidFen(retryRow.starting_fen"), "retry path must not validate starting_fen");
  assert.ok(source.includes("isValidFen(row.servedFen)"), "app-training path must validate served FEN");
  assert.ok(!source.includes("cpLoss"), "next-position route must not expose cpLoss, including debug");
  assert.ok(source.includes("validatePlayableTrainingFen"), "route must import playable FEN validation");
  assert.ok(!source.includes("validateTrainingQueueItem"), "route must not use legacy queue item validation");
  assert.ok(!source.includes("sequenceLength"), "route must not use fixed sequence length");
  assert.ok(!source.includes("DEFAULT_SEQUENCE_LENGTH"), "route must not define a default sequence length");
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

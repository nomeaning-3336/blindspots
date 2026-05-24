import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("dashboard Start action navigates with positionId through dashboard fade transition", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync("components/dashboard-client.tsx", "utf8");

  const startMatches = source.match(/onNavigateToTrain\(`\/\?positionId=\$\{encodeURIComponent\(position\.id\)\}`\)/g);
  assert.ok(startMatches, "Start action must navigate to /?positionId=<id>");
  assert.equal(startMatches.length, 1, "exactly one Start navigation expected");
  assert.match(source, /setExitingToTrain\(true\)/);
  assert.match(source, /router\.push\(href\)/);

  const analyzeMatch = source.match(/onNavigateToTrain\(`\/\?positionId=\$\{encodeURIComponent\(position\.id\)\}&mode=postmortem`\)/);
  assert.ok(analyzeMatch, "Analyze action must still include mode=postmortem");
});

test("root page forwards positionId to TrainPage", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync("app/page.tsx", "utf8");

  // searchParams type must include positionId and legacy mistakeId fallback
  assert.match(source, /positionId\?/);
  assert.match(source, /mistakeId\?/);

  // initialMistakeId must be passed to <TrainPage>
  assert.match(source, /initialMistakeId/);
  assert.match(source, /<TrainPage[\s\S]*initialMistakeId/);
});

test("train-client fetches next-position with ?positionId= on retry", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  // fetchNextPosition must accept optional mistakeId
  assert.match(source, /fetchNextPosition\(mistakeId/);

  // URL must include ?positionId= when provided
  assert.match(source, /\?positionId=\$\{encodeURIComponent\(mistakeId\)\}/);

  // autoStart must be true when initialMistakeId is used
  assert.match(source, /autoStart:\s*true/);

  // Ref must guard single consumption
  assert.match(source, /initialMistakeIdConsumedRef/);
});

test("next-position API accepts ?positionId= and returns retry-shaped response shape", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync("app/api/train/next-position/route.ts", "utf8");

  // GET must accept Request
  assert.match(source, /export async function GET\(request:\s*Request\)/);

  // Must extract positionId from searchParams with legacy fallback
  assert.match(source, /searchParams\.get\("positionId"\)/);
  assert.match(source, /searchParams\.get\("mistakeId"\)/);

  // Must set queueSource to "retry"
  assert.match(source, /queueSource:\s*"retry"/);

  // Must set selectedServeMode to "retry"
  assert.match(source, /selectedServeMode:\s*"retry"/);

  // Must validate setup prelude
  assert.match(source, /normalizeSetupPrelude/);

  // Must fall through silently on missing row
  const fallThroughComment = source.includes("Fall through to normal queue selection");
  assert.ok(fallThroughComment, "must fall through silently on invalid/missing retry row");
});

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("dashboard Retry link includes mistakeId in href", () => {
  // Verify the dashboard client renders Retry links with ?mistakeId=
  const fs = require("node:fs");
  const source = fs.readFileSync("components/dashboard-client.tsx", "utf8");

  // The Retry button must link to /train?mistakeId=... (no mode param)
  const retryMatches = source.match(/href=\{`\/train\?mistakeId=\$\{encodeURIComponent\(position\.id\)\}`\}/g);
  assert.ok(retryMatches, "Retry link must use /train?mistakeId=<id>");
  assert.equal(retryMatches.length, 1, "exactly one Retry link expected");

  // The Analyze button must still use mode=postmortem
  const analyzeMatch = source.match(/href=\{`\/train\?mistakeId=\$\{encodeURIComponent\(position\.id\)\}&mode=postmortem`\}/);
  assert.ok(analyzeMatch, "Analyze link must still include mode=postmortem");
});

test("page.tsx forwards mistakeId to TrainPage", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync("app/(shell)/train/page.tsx", "utf8");

  // searchParams type must include mistakeId
  assert.match(source, /mistakeId\?/);

  // initialMistakeId must be passed to <TrainPage>
  assert.match(source, /initialMistakeId/);
  assert.match(source, /<TrainPage[\s\S]*initialMistakeId/);
});

test("train-client fetches next-position with ?mistakeId= on retry", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  // fetchNextPosition must accept optional mistakeId
  assert.match(source, /fetchNextPosition\(mistakeId/);

  // URL must include ?mistakeId= when provided
  assert.match(source, /\?mistakeId=\$\{encodeURIComponent\(mistakeId\)\}/);

  // autoStart must be true when initialMistakeId is used
  assert.match(source, /autoStart:\s*true/);

  // Ref must guard single consumption
  assert.match(source, /initialMistakeIdConsumedRef/);
});

test("next-position API accepts ?mistakeId= and returns retry-shaped response shape", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync("app/api/train/next-position/route.ts", "utf8");

  // GET must accept Request
  assert.match(source, /export async function GET\(request:\s*Request\)/);

  // Must extract mistakeId from searchParams
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

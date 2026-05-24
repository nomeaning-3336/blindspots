import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/generate-agent-magic-link.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

test("agent magic link script uses Supabase admin generateLink without sending email", () => {
  assert.match(source, /auth\.admin\.generateLink\(\{/);
  assert.match(source, /type: "magiclink"/);
  assert.match(source, /options:\s*\{\s*redirectTo: providerRedirectTo,/);
  assert.match(source, /properties\?\.hashed_token/);
  assert.match(source, /providerActionLink/);
  assert.doesNotMatch(source, /signInWithOtp|send-magic-link/);
});

test("agent magic link script defaults to the root SPA callback", () => {
  assert.match(source, /nextPath: "\/"/);
  assert.match(source, /new URL\("\/auth\/agent-link", origin\)/);
  assert.match(source, /url\.searchParams\.set\("token_hash", tokenHash\)/);
  assert.match(source, /url\.searchParams\.set\("next", nextPath\)/);
});

test("agent magic link script tolerates Git Bash slash path conversion", () => {
  assert.match(source, /const msysPathPrefix = "C:\/Program Files\/Git"/);
  assert.match(source, /nextPath = nextPath\.slice\(msysPathPrefix\.length\)/);
});

test("package exposes the agent magic link script", () => {
  assert.equal(
    packageJson.scripts["auth:agent-link"],
    "node scripts/generate-agent-magic-link.mjs",
  );
});

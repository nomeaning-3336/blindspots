import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const trainRouteSource = readFileSync("app/api/clone/train/route.ts", "utf8");
const moveRouteSource = readFileSync("app/api/clone/game/[id]/move/route.ts", "utf8");

test("clone training delegates embedding adaptation to Maia4All service", () => {
  assert.match(trainRouteSource, /MAIA4ALL_URL/);
  assert.match(trainRouteSource, /maia4all_not_configured/);
  assert.match(trainRouteSource, /\/v1\/embeddings\/train/);
  assert.match(trainRouteSource, /embeddingModel/);
  assert.match(trainRouteSource, /embeddingVersion/);
  assert.doesNotMatch(trainRouteSource, /Array\.from\(\{\s*length:\s*128\s*\}/);
  assert.doesNotMatch(trainRouteSource, /placeholder-random-v0/);
});

test("clone move route delegates policy to Maia4All and rejects illegal service moves", () => {
  assert.match(moveRouteSource, /MAIA4ALL_URL/);
  assert.match(moveRouteSource, /\/v1\/move/);
  assert.match(moveRouteSource, /move_policy/);
  assert.match(moveRouteSource, /status:\s*502/);
  assert.doesNotMatch(moveRouteSource, /function generateRandomLegalMove/);
  assert.doesNotMatch(moveRouteSource, /Math\.random/);
  assert.doesNotMatch(moveRouteSource, /placeholder-random-v0/);
});

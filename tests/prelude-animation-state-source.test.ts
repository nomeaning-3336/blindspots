import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

test("served setup preludes load directly on the playable FEN", () => {
  const loadSource = source.slice(
    source.indexOf("const visibleInitialFen = payload.fen"),
    source.indexOf("async function startPendingInitialEngineMove"),
  );

  assert.match(loadSource, /const visibleInitialFen = payload\.fen/);
  assert.match(loadSource, /setActiveSetupReplayIndex\(1\)/);
  assert.match(loadSource, /setDisplayStartingFen\(visibleInitialFen\)/);
  assert.match(loadSource, /setFen\(visibleInitialFen\)/);
  assert.doesNotMatch(loadSource, /setPendingInitialEngineMove\(payload\)/);
  assert.doesNotMatch(loadSource, /setIsAwaitingStartGesture\(true\)/);
});

test("prelude playback no longer delays or animates the initial setup move", () => {
  const playbackSource = source.slice(
    source.indexOf("async function startPendingInitialEngineMove"),
    source.indexOf("function prefetchNextPosition"),
  );

  assert.doesNotMatch(playbackSource, /playInitialOpponentMoveFromPayload/);
  assert.doesNotMatch(playbackSource, /PRELUDE_SETUP_MOVE_DELAY_MS/);
  assert.doesNotMatch(playbackSource, /setFen\(previousFen\)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("served setup preludes initialize on the before-FEN replay frame", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const loadSource = source.slice(
    source.indexOf("const visibleInitialFen = payload.previousFen ?? payload.fen"),
    source.indexOf("async function startPendingInitialEngineMove"),
  );

  assert.match(loadSource, /const setupPreviousFen = payload\.previousFen/);
  assert.match(loadSource, /const setupPlayedMove = payload\.playedMove/);
  assert.match(loadSource, /const hasSetupPrelude =\s*typeof setupPreviousFen === "string" &&\s*typeof setupPlayedMove === "string"/);
  assert.match(loadSource, /setActiveSetupReplayIndex\(hasSetupPrelude \? 0 : 1\)/);
  assert.match(loadSource, /setDisplayStartingFen\(visibleInitialFen\)/);
  assert.match(loadSource, /setFen\(visibleInitialFen\)/);
  assert.match(loadSource, /if \(hasSetupPrelude\)/);
  assert.doesNotMatch(loadSource, /if \(payload\.previousFen && payload\.playedMove\)/);
});

test("prelude playback renders before-FEN before switching to after-FEN", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const playbackSource = source.slice(
    source.indexOf("async function playInitialOpponentMoveFromPayload"),
    source.indexOf("function prefetchNextPosition"),
  );

  assert.match(playbackSource, /setActiveSetupReplayIndex\(0\);\s*setFen\(previousFen\)/);
  assert.match(playbackSource, /await nextAnimationFrame\(\)/);
  assert.match(playbackSource, /await delayMs\(PRELUDE_SETUP_MOVE_DELAY_MS\)/);
  assert.match(playbackSource, /setActiveSetupReplayIndex\(1\)/);
  assert.match(playbackSource, /setFen\(payload\.fen!\)/);
  assert.ok(
    playbackSource.indexOf("setActiveSetupReplayIndex(0)") <
      playbackSource.indexOf("setActiveSetupReplayIndex(1)"),
  );
});

test("prelude pieces do not animate before the start gesture", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const animationSource = source.slice(
    source.indexOf("const shouldAnimateBoardPieces"),
    source.indexOf("const [postmortemOnboardingStep"),
  );
  const boardSource = source.slice(
    source.indexOf("<BoardWithPlayerStrips"),
    source.indexOf("{showStartGestureOverlay"),
  );

  assert.match(animationSource, /const shouldAnimateDisplayedBoardPieces =\s*shouldAnimateBoardPieces &&\s*!isAwaitingStartGesture &&\s*!isPositionLoading/);
  assert.doesNotMatch(boardSource, /pieceAnimation=\{shouldAnimateBoardPieces\}/);
  assert.match(boardSource, /pieceAnimation=\{shouldAnimateDisplayedBoardPieces\}/);
});

test("static onboarding prelude also resets to before-FEN frame", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const startIndex = source.indexOf("async function startPreplayOnboardingPosition");
  const onboardingSource = source.slice(
    startIndex,
    source.indexOf("useLayoutEffect", startIndex),
  );

  assert.match(onboardingSource, /setDisplayStartingFen\(ONBOARDING_PREVIEW_POSITION\.previousFen\)/);
  assert.match(onboardingSource, /setActiveSetupReplayIndex\(0\)/);
  assert.match(onboardingSource, /setActiveSetupReplayIndex\(1\)/);
  assert.ok(
    onboardingSource.indexOf("setActiveSetupReplayIndex(0)") <
      onboardingSource.indexOf("setActiveSetupReplayIndex(1)"),
  );
});

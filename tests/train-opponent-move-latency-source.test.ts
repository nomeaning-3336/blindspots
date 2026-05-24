import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("stockfish harness reuses a shared initialized process across requests", () => {
  const source = readFileSync("lib/engines/stockfish.ts", "utf8");

  assert.match(source, /let sharedEngineProcess:/);
  assert.match(source, /let sharedEngineInitPromise:/);
  assert.match(source, /let sharedEngineQueue: Promise<unknown> = Promise\.resolve\(\);/);
  assert.match(source, /async function getSharedStockfishProcess\(\)/);
  assert.match(source, /sharedEngineQueue = run\.then\(\(\) => undefined, \(\) => undefined\);/);
  assert.doesNotMatch(source, /const engine = createStockfishProcess\(\);\s*return \(async \(\) => \{/);
});

test("train opponent move route keeps a tight engine time budget", () => {
  const source = readFileSync("app/api/train/opponent-move/route.ts", "utf8");

  assert.match(source, /const TRAIN_ENGINE_TIME_LIMIT_MS = 1000;/);
  assert.match(source, /responseDelayMs: 0,/);
  assert.match(source, /skipRefinement: true,/);
});

test("stockfish humanization refinement can be disabled for latency-sensitive moves", () => {
  const typesSource = readFileSync("lib/engines/types.ts", "utf8");
  const dispatcherSource = readFileSync("lib/engines/dispatcher.ts", "utf8");
  const stockfishSource = readFileSync("lib/engines/stockfish.ts", "utf8");

  assert.match(typesSource, /skipRefinement\?: boolean;/);
  assert.match(dispatcherSource, /skipRefinement: options\.skipRefinement,/);
  assert.match(
    stockfishSource,
    /const shouldRefineHumanMove = targetElo < 2000 && options\.skipRefinement !== true;/,
  );
  assert.match(stockfishSource, /if \(shouldRefineHumanMove\) \{/);
});

test("active training prioritizes opponent response before background user move evaluation", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const handleMoveStart = source.indexOf("function handleMove(move: BoardMove)");
  const handleExploreStart = source.indexOf("function handleExploreMove(move: BoardMove)");
  const handleMoveSource = source.slice(handleMoveStart, handleExploreStart);

  assert.ok(handleMoveStart >= 0, "handleMove should exist");
  assert.ok(handleExploreStart > handleMoveStart, "handleExploreMove should follow handleMove");
  assert.match(handleMoveSource, /const evaluateCurrentUserMove = \(\) =>/);
  assert.match(handleMoveSource, /void requestOpponentMove\(fenAfterUserMove, movesAfterUserMove\)\.finally\(\(\) => \{/);
  assert.match(
    handleMoveSource,
    /void requestOpponentMove\(fenAfterUserMove, movesAfterUserMove\)\.finally\(\(\) => \{\s*evaluateCurrentUserMove\(\);\s*warmEngineLinesForSequence\(movesAfterUserMove\);/,
  );
});

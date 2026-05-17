import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("add position feedback board rendering is isolated from selected move highlights", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const overrideSource = source.slice(
    source.indexOf("type AddPositionFeedbackBoardOverride"),
    source.indexOf("const selectedMoveUci ="),
  );
  const boardRenderSource = source.slice(
    source.indexOf("<BoardWithPlayerStrips"),
    source.indexOf("onCircleHover={setHoveredAnnotationSquare}"),
  );

  assert.match(source, /const \[addPositionFeedbackBoardOverride, setAddPositionFeedbackBoardOverride\]/);
  assert.match(source, /const \[suppressAddPositionFeedbackBoardChrome, setSuppressAddPositionFeedbackBoardChrome\]/);
  assert.match(source, /const boardDisplayOverride = addPositionFeedbackBoardOverride/);
  assert.match(overrideSource, /const displayedBoardFen = boardDisplayOverride\?\.fen \?\? boardFen/);
  assert.match(overrideSource, /const displayedReplayLastMove = boardDisplayOverride \? boardDisplayOverride\.lastMove : replayLastMove/);
  assert.match(overrideSource, /const displayedBoardLastMoveBadge = boardDisplayOverride/);
  assert.match(overrideSource, /: suppressAddPositionFeedbackBoardChrome\s*\?\s*null\s*: boardLastMoveBadge/);
  assert.match(overrideSource, /const displayedBoardHighlights = boardDisplayOverride\s*\?\s*boardDisplayOverride\.highlightedSquares/);
  assert.match(overrideSource, /: suppressAddPositionFeedbackBoardChrome\s*\?\s*undefined\s*: hoveredMoveSquares/);
  assert.match(boardRenderSource, /fen=\{displayedBoardFen\}/);
  assert.match(boardRenderSource, /selectedSquare=\{boardDisplayOverride \? null : exploreSelectedSquare\}/);
  assert.match(boardRenderSource, /lastMove=\{displayedReplayLastMove\}/);
  assert.match(boardRenderSource, /lastMoveBadge=\{displayedBoardLastMoveBadge\}/);
  assert.match(boardRenderSource, /highlightedSquares=\{displayedBoardHighlights\}/);
  assert.match(boardRenderSource, /engineArrows=\{boardDisplayOverride \? \[\] : buildEngineArrows/);
});

test("add position feedback override is set explicitly and cleared after the sequence", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const feedbackSource = source.slice(
    source.indexOf("async function runAddPositionFeedback"),
    source.indexOf("async function addPositionToLearningQueue"),
  );

  assert.match(feedbackSource, /setAddPositionFeedbackBoardOverride\(null\);\s*setSuppressAddPositionFeedbackBoardChrome\(false\);\s*void addPositionToLearningQueue\(snapshot\)/);
  assert.match(feedbackSource, /await addPositionToLearningQueue\(snapshot\)/);
  assert.match(feedbackSource, /commitAddPositionFeedbackEndState\(snapshot\);\s*setAddPositionFeedbackBoardOverride\(null\)/);
  assert.match(feedbackSource, /setAddPositionFeedbackBoardOverride\(null\);\s*setRollbackAnimating\(false\)/);
  assert.match(feedbackSource, /setSelectedMoveIndex\(null\)/);
  assert.match(feedbackSource, /setHoveredMoveSquares\(null\)/);
  assert.match(feedbackSource, /setAddPositionFeedbackBoardOverride\(\{\s*fen: nextFen,\s*lastMove: nextLastMove,\s*highlightedSquares: undefined,\s*lastMoveBadge: null,\s*\}\)/);
});

test("add position feedback commits normal board state before clearing override", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const commitSource = source.slice(
    source.indexOf("function commitAddPositionFeedbackEndState"),
    source.indexOf("async function addPositionToLearningQueue"),
  );

  assert.match(commitSource, /const finalLastMove = snapshot\.setupMove\s*\?\s*lastMoveFromTrainingMove\(snapshot\.setupMove\)\s*:\s*null/);
  assert.match(commitSource, /setSelectedMoveIndex\(null\)/);
  assert.match(commitSource, /setHoveredMoveSquares\(null\)/);
  assert.match(commitSource, /setExploratoryHistoryIndex\(-1\)/);
  assert.match(commitSource, /setExploratoryFen\(snapshot\.decisionFen\)/);
  assert.match(commitSource, /setExploratoryLastMove\(finalLastMove\)/);
  assert.match(commitSource, /setSuppressAddPositionFeedbackBoardChrome\(true\)/);
});

test("add position feedback board chrome suppression clears on user navigation", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const exploreMoveSource = source.slice(
    source.indexOf("function handleExploreMove"),
    source.indexOf("function handleSaveNote"),
  );
  const navigationSource = source.slice(
    source.indexOf("function navigateExploratoryLine"),
    source.indexOf("// ── Shared navigation helpers"),
  );

  assert.match(exploreMoveSource, /setSuppressAddPositionFeedbackBoardChrome\(false\)/);
  assert.match(navigationSource, /function navigateExploratoryLine[\s\S]*setSuppressAddPositionFeedbackBoardChrome\(false\)/);
  assert.match(navigationSource, /function navigateExploreTo[\s\S]*setSuppressAddPositionFeedbackBoardChrome\(false\)/);
});

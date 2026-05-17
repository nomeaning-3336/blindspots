import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("add-position onboarding does not wait for annotation evaluation before success", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const addHandlerSource = source.slice(
    source.indexOf("async function addPositionToLearningQueue"),
    source.indexOf("showAlert({", source.indexOf("async function addPositionToLearningQueue")),
  );
  const annotationIndex = addHandlerSource.indexOf("evaluateMoveForAnnotationClient");
  const successIndex = addHandlerSource.indexOf("setAddPositionOnboardingPhase(\"success-entering\")");

  assert.notEqual(annotationIndex, -1);
  assert.notEqual(successIndex, -1);
  assert.doesNotMatch(addHandlerSource, /await evaluateMoveForAnnotation/);
  assert.match(addHandlerSource, /void evaluateMoveForAnnotationClient\(annotationMove\)\.then/);
  assert.ok(successIndex > annotationIndex);
});

test("add-position onboarding uses a short success hold before saved modal", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const addHandlerSource = source.slice(
    source.indexOf("async function addPositionToLearningQueue"),
    source.indexOf("showAlert({", source.indexOf("async function addPositionToLearningQueue")),
  );

  assert.match(addHandlerSource, /setPostmortemAddPositionActionDone\(true\)/);
  assert.doesNotMatch(addHandlerSource, /\}, 900\)/);
  assert.match(addHandlerSource, /\}, 420\)/);
});

test("custom queued move annotation uses client Stockfish searchmoves", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const evaluatorSource = source.slice(
    source.indexOf("async function evaluateMoveForAnnotationClient"),
    source.indexOf("async function addPositionToLearningQueue"),
  );

  assert.match(evaluatorSource, /ClientStockfishEngine/);
  assert.match(evaluatorSource, /new ClientStockfishEngine\(\{ hashMb: 16 \}\)/);
  assert.match(evaluatorSource, /engine\.dispose\(\)/);
  assert.match(evaluatorSource, /clientLinesToTrainingEngineLines/);
  assert.match(evaluatorSource, /movetimeMs: 500/);
  assert.match(evaluatorSource, /searchMoves: \[move\.uci\]/);
  assert.match(evaluatorSource, /fen: move\.fenAfter/);
  assert.doesNotMatch(evaluatorSource, /\/api\/train\/evaluate-move/);
});

test("queued exploratory setup move still seeds annotation metadata", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const targetSource = source.slice(
    source.indexOf("const learningQueueAddTarget = useMemo"),
    source.indexOf("const learningQueueAddTargetFen ="),
  );

  assert.match(targetSource, /activeExploratoryPosition\?\.move\?\.fenAfter/);
  assert.match(targetSource, /normalizeDecisionFen\(activeExploratoryPosition\.move\.fenAfter\) === normalizeDecisionFen\(boardFen\)/);
  assert.match(targetSource, /activeExploratoryPosition\.move/);
});

test("move notes only list canonical sequence user moves from queued decision FENs", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const notesSource = source.slice(
    source.indexOf("const annotatableMoves = useMemo"),
    source.indexOf("// Dev-only: log annotation state"),
  );

  assert.match(notesSource, /return canonicalPostmortemMoves\s*\.filter/);
  assert.match(notesSource, /cm\.kind !== "user"/);
  assert.match(notesSource, /queuedLearningPositionFens\.has\(normalizeDecisionFen\(cm\.move\.fenBefore\)\)/);
  assert.doesNotMatch(notesSource, /for \(const position of exploratoryHistory\)/);
  assert.doesNotMatch(notesSource, /rows\.push/);
  assert.doesNotMatch(notesSource, /queuedLearningMoveKeys/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = () => readFileSync("app/(shell)/train/train-client.tsx", "utf8");

test("next and skip position use in-memory transition instead of train href navigation", () => {
  const trainClient = source();
  const railSource = trainClient.slice(
    trainClient.indexOf("<TrainingNotesRail"),
    trainClient.indexOf("dashboardButton={<a href=\"/\""),
  );
  const footerSource = trainClient.slice(
    trainClient.indexOf("data-tour=\"postmortem-actions\""),
    trainClient.indexOf("<span className={postmortemActionTextClassName}>Return to Dashboard</span>"),
  );

  assert.doesNotMatch(trainClient, /href="\/train"/);
  assert.doesNotMatch(trainClient, /router\.push/);
  assert.doesNotMatch(trainClient, /from "next\/link"/);
  assert.match(railSource, /onClick=\{\(\) => void handleAdvanceTrainingPosition\(\)\}/);
  assert.match(railSource, /"Skip Position"/);
  assert.match(footerSource, /onClick=\{\(\) => void handleAdvanceTrainingPosition\(\)\}/);
  assert.match(footerSource, /"Next Position"/);
});

test("next position mirrors concrete position id to URL with replaceState", () => {
  const trainClient = source();
  const syncSource = trainClient.slice(
    trainClient.indexOf("function syncTrainPositionUrl"),
    trainClient.indexOf("type PostmortemTourStep"),
  );
  const applySource = trainClient.slice(
    trainClient.indexOf("function applyNextPosition"),
    trainClient.indexOf("async function startPendingInitialEngineMove"),
  );

  assert.match(syncSource, /\/train\?positionId=/);
  assert.match(syncSource, /window\.history\.replaceState\(null, "", nextUrl\)/);
  assert.doesNotMatch(syncSource, /pushState/);
  assert.match(applySource, /currentMistakeIdRef\.current\s*=\s*typeof payload\.mistakeId === "string" \? payload\.mistakeId : null/);
  assert.match(applySource, /syncTrainPositionUrl\(currentMistakeIdRef\.current\)/);
});

test("delayed prelude is cancellable across position transitions", () => {
  const trainClient = source();
  const applySource = trainClient.slice(
    trainClient.indexOf("function applyNextPosition"),
    trainClient.indexOf("async function startPendingInitialEngineMove"),
  );

  assert.match(trainClient, /const delayedPreludeTimerRef = useRef<number \| null>\(null\)/);
  assert.match(applySource, /window\.clearTimeout\(delayedPreludeTimerRef\.current\)/);
  assert.match(applySource, /delayedPreludeTimerRef\.current = window\.setTimeout/);
});

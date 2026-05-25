import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = () => readFileSync("app/(shell)/train/train-client.tsx", "utf8");

test("next and skip position use in-memory transition instead of train href navigation", () => {
  const trainClient = source();
  const railSource = trainClient.slice(
    trainClient.indexOf("<TrainingNotesRail"),
    trainClient.indexOf("dashboardButton={"),
  );
  const footerSource = trainClient.slice(
    trainClient.indexOf("data-tour=\"postmortem-actions\""),
    trainClient.indexOf("<span className={postmortemActionTextClassName}>Return to Home</span>"),
  );

  assert.doesNotMatch(trainClient, /href="\/train"/);
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

  assert.match(syncSource, /\/\?positionId=/);
  assert.match(syncSource, /window\.history\.replaceState\(null, "", nextUrl\)/);
  assert.doesNotMatch(syncSource, /pushState/);
  assert.match(applySource, /currentTrainingItemIdRef\.current\s*=\s*typeof payload\.trainingItemId === "string" \? payload\.trainingItemId : null/);
  assert.match(applySource, /syncTrainPositionUrl\(currentTrainingItemIdRef\.current\)/);
});

test("position transitions do not use delayed prelude timers", () => {
  const trainClient = source();
  const applySource = trainClient.slice(
    trainClient.indexOf("function applyNextPosition"),
    trainClient.indexOf("async function startPendingInitialEngineMove"),
  );

  assert.doesNotMatch(applySource, /window\.clearTimeout\(delayedPreludeTimerRef\.current\)/);
  assert.doesNotMatch(applySource, /delayedPreludeTimerRef\.current = window\.setTimeout/);
});

test("return to home collapses to the initial state in-page instead of navigating", () => {
  const trainClient = source();

  // The training room is a single page — no router navigation away from it.
  assert.doesNotMatch(trainClient, /import\s*\{\s*useRouter/);
  assert.doesNotMatch(trainClient, /router\.push/);

  // isReturnToHomeTransitioning state exists
  assert.match(trainClient, /isReturnToHomeTransitioning/);

  // isTrainLayoutExiting derived from both transition states
  assert.match(trainClient, /isTrainLayoutExiting/);

  // handleReturnToHome function exists
  assert.match(trainClient, /function handleReturnToHome/);

  const handleReturnSource = trainClient.slice(
    trainClient.indexOf("function handleReturnToHome"),
    trainClient.indexOf("async function playInitialOpponentMoveFromPayload"),
  );
  // handleReturnToHome sets the transitioning flag
  assert.match(handleReturnSource, /setIsReturnToHomeTransitioning\(true\)/);

  // handleReturnToHome uses the postmortem transition delay
  assert.match(handleReturnSource, /delayMs\(POSTMORTEM_NEXT_POSITION_TRANSITION_MS\)/);

  // handleReturnToHome collapses the postmortem and loads the next position
  // idle (no auto-start) rather than navigating to another route.
  assert.match(handleReturnSource, /setState\("active"\)/);
  assert.match(handleReturnSource, /loadNextPosition\(\)/);
  assert.doesNotMatch(handleReturnSource, /\/dashboard/);

  // TrainingNotesRail dashboardButton uses onClick instead of href
  const railSource = trainClient.slice(
    trainClient.indexOf("dashboardButton={"),
    trainClient.indexOf("dashboardButton={") + 800,
  );
  assert.match(railSource, /onClick=\{\(\) => void handleReturnToHome\(\)\}/);
  assert.match(railSource, /type="button"/);
  assert.match(railSource, /Returning\.\.\./);

  // postmortem footer Return to Home button uses onClick instead of href
  const footerSource = trainClient.slice(
    trainClient.indexOf("data-tour=\"postmortem-actions\""),
    trainClient.indexOf("<span className={postmortemActionTextClassName}>Return to Home</span>"),
  );
  assert.match(footerSource, /onClick=\{.*handleReturnToHome.*\}/);
  assert.doesNotMatch(footerSource, /href="\/"/);

  // button shows "Returning..." text when transitioning
  assert.match(trainClient, /Returning\.\.\./);
});


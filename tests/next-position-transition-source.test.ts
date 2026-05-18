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
    trainClient.indexOf("<span className={postmortemActionTextClassName}>Return to Dashboard</span>"),
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

test("return to dashboard uses programmatic transition instead of href navigation", () => {
  const trainClient = source();

  // useRouter is imported from next/navigation
  assert.match(trainClient, /import\s*\{\s*useRouter/);
  assert.match(trainClient, /from\s+"next\/navigation"/);

  // isTrainDashboardExitTransitioning state exists
  assert.match(trainClient, /isTrainDashboardExitTransitioning/);

  // isTrainLayoutExiting derived from both transition states
  assert.match(trainClient, /isTrainLayoutExiting/);

  // handleReturnToDashboard function exists
  assert.match(trainClient, /function handleReturnToDashboard/);

  // handleReturnToDashboard sets the exit transitioning flag
  const handleReturnSource = trainClient.slice(
    trainClient.indexOf("function handleReturnToDashboard"),
    trainClient.indexOf("async function playInitialOpponentMoveFromPayload"),
  );
  assert.match(handleReturnSource, /setIsTrainDashboardExitTransitioning\(true\)/);

  // handleReturnToDashboard uses the postmortem transition delay
  assert.match(handleReturnSource, /delayMs\(POSTMORTEM_NEXT_POSITION_TRANSITION_MS\)/);

  // handleReturnToDashboard calls router.push("/")
  assert.match(handleReturnSource, /router\.push\("\/"\)/);

  // TrainingNotesRail dashboardButton uses onClick instead of href
  const railSource = trainClient.slice(
    trainClient.indexOf("dashboardButton={"),
    trainClient.indexOf("dashboardButton={") + 800,
  );
  assert.match(railSource, /onClick=\{\(\) => void handleReturnToDashboard\(\)\}/);
  assert.match(railSource, /type="button"/);
  assert.match(railSource, /Returning\.\.\./);

  // postmortem footer Return to Dashboard button uses onClick instead of href
  const footerSource = trainClient.slice(
    trainClient.indexOf("data-tour=\"postmortem-actions\""),
    trainClient.indexOf("<span className={postmortemActionTextClassName}>Return to Dashboard</span>"),
  );
  assert.match(footerSource, /onClick=\{.*handleReturnToDashboard.*\}/);
  assert.doesNotMatch(footerSource, /href="\/"/);

  // button shows "Returning..." text when transitioning
  assert.match(trainClient, /Returning\.\.\./);
});

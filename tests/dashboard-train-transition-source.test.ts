import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = () => readFileSync("components/dashboard-client.tsx", "utf8");

test("dashboard fades out before navigating to train", () => {
  const dashboard = source();

  assert.match(dashboard, /const DASHBOARD_TRAIN_EXIT_MS = 320/);
  assert.match(dashboard, /const \[exitingToTrain, setExitingToTrain\] = useState\(false\)/);
  assert.match(dashboard, /setExitingToTrain\(true\)/);
  assert.match(dashboard, /window\.setTimeout\(\(\) => \{/);
  assert.match(dashboard, /router\.push\(href\)/);
  assert.match(dashboard, /transition-\[opacity,transform\]/);
  assert.match(dashboard, /opacity-0 translate-y-2 scale-\[0\.992\]/);
});

test("dashboard train actions use the shared transition handler instead of train links", () => {
  const dashboard = source();

  assert.doesNotMatch(dashboard, /href="\/train"/);
  assert.doesNotMatch(dashboard, /href=\{`\/train/);
  assert.match(dashboard, /onClick=\{\(\) => onNavigateToTrain\("\/"\)\}/);
  assert.match(dashboard, /onClick=\{\(\) => onNavigateToTrain\(`\/\?positionId=\$\{encodeURIComponent\(position\.id\)\}`\)\}/);
  assert.match(dashboard, /onClick=\{\(\) => onNavigateToTrain\(`\/\?positionId=\$\{encodeURIComponent\(position\.id\)\}&mode=postmortem`\)\}/);
});

test("train page fades in after dashboard navigation", () => {
  const train = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  assert.match(train, /const \[isTrainPageEntered, setIsTrainPageEntered\] = useState\(false\)/);
  assert.match(train, /window\.requestAnimationFrame\(\(\) => setIsTrainPageEntered\(true\)\)/);
  assert.match(train, /isTrainPageEntered \? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"/);
});

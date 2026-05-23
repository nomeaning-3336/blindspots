import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const dashboardSource = readFileSync("components/dashboard-client.tsx", "utf8");
const trainSource = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
const addPositionSource = dashboardSource.slice(
  dashboardSource.indexOf("function AddPositionSection"),
  dashboardSource.indexOf("function InfoTooltip"),
);

test("dashboard renders add-position section between daily goal and queue overview", () => {
  assert.match(dashboardSource, /function AddPositionSection/);
  assert.match(
    dashboardSource,
    /<DailyGoalSection[\s\S]*\/>[\s\S]*<AddPositionSection[\s\S]*\/>[\s\S]*<QueueOverviewSection/,
  );
});

test("dashboard add-position form is FEN-only and posts only decisionFen", () => {
  assert.match(addPositionSource, /new Chess\(fenText\.trim\(\)\)\.fen\(\)/);
  assert.match(addPositionSource, /body: JSON\.stringify\(\{\s*decisionFen: canonicalFen,?\s*\}\)/);
  assert.doesNotMatch(addPositionSource, /setupPreviousFen/);
  assert.doesNotMatch(addPositionSource, /setupPlayedMoveUci/);
  assert.doesNotMatch(addPositionSource, /setupPlayedMoveSan/);
});

test("dashboard add-position form drops the prelude input and board preview", () => {
  assert.doesNotMatch(dashboardSource, /parsePreludeMove/);
  assert.doesNotMatch(dashboardSource, /AddPositionPreview/);
  assert.doesNotMatch(addPositionSource, /preludeText/);
  assert.doesNotMatch(addPositionSource, /ReplayThumbnail/);
  assert.doesNotMatch(addPositionSource, /useLayoutEffect/);
});

test("real training capture path still sends setup_* metadata", () => {
  assert.match(trainSource, /setupPreviousFen: preludeMove\?\.fenBefore \?\? null/);
  assert.match(trainSource, /setupPlayedMoveUci: preludeMove\?\.uci \?\? null/);
  assert.match(trainSource, /setupPlayedMoveSan: preludeMove\?\.san \?\? null/);
});

test("new position additions use the position endpoint name", () => {
  assert.match(dashboardSource, /fetch\("\/api\/position\/add"/);
  assert.match(trainSource, /fetch\("\/api\/position\/add"/);
  assert.doesNotMatch(dashboardSource, /\/api\/dashboard\/mistakes\/add/);
  assert.doesNotMatch(trainSource, /\/api\/dashboard\/mistakes\/add/);
});

test("position add route exists under the position namespace", () => {
  const routeSource = readFileSync("app/api/position/add/route.ts", "utf8");
  assert.match(routeSource, /source_type: "app_training"/);
  assert.match(routeSource, /setup_previous_fen: setupPreviousFen/);
});

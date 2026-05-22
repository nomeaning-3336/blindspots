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

test("dashboard add-position form validates FEN and prelude move before posting", () => {
  assert.match(dashboardSource, /new Chess\(fenText\.trim\(\)\)/);
  assert.match(dashboardSource, /parsePreludeMove\(chess, preludeText\.trim\(\)\)/);
  assert.match(dashboardSource, /try \{[\s\S]*chess\.move\(moveText, \{ strict: false \}\)[\s\S]*\} catch \{[\s\S]*return null;[\s\S]*\}/);
  assert.match(dashboardSource, /setupPreviousFen: fenText\.trim\(\)/);
  assert.match(dashboardSource, /setupPlayedMoveUci: parsed\.uci/);
  assert.match(dashboardSource, /setupPlayedMoveSan: parsed\.san/);
});

test("dashboard add-position form renders a live board preview with prelude replay", () => {
  assert.match(dashboardSource, /const preview = useMemo\(\(\): AddPositionPreview \| null => \{/);
  assert.match(dashboardSource, /const previewKey = preview/);
  assert.match(dashboardSource, /useLayoutEffect\(\(\) => \{/);
  assert.match(addPositionSource, /transition-\[opacity,transform\] duration-\[420ms\] ease-\[cubic-bezier\(0\.22,1,0\.36,1\)\]/);
  assert.match(addPositionSource, /previewVisible \? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-1 scale-\[0\.992\]"/);
  assert.match(dashboardSource, /key=\{`\$\{preview\.previousFen \?\? "direct"\}:\$\{preview\.finalFen\}:\$\{preview\.playedMove \?\? "none"\}`\}/);
  assert.match(dashboardSource, /<ReplayThumbnail[\s\S]*previousFen=\{preview\.previousFen\}[\s\S]*finalFen=\{preview\.finalFen\}[\s\S]*playedMove=\{preview\.playedMove\}/);
  assert.match(addPositionSource, /<ReplayThumbnail[\s\S]*size=\{360\}/);
  assert.match(dashboardSource, /preview\.preludeSan \? `\$\{preview\.preludeSan\} plays first/);
  assert.match(dashboardSource, /Valid position · \$\{preview\.sideToMove\} to move/);
  assert.doesNotMatch(dashboardSource, /Lands in New\./);
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

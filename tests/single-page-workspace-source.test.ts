import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync("components/protected-app-shell.tsx", "utf8");
const homePageSource = readFileSync("app/page.tsx", "utf8");
const trainPageSource = readFileSync("app/(shell)/train/page.tsx", "utf8");
const trainClientSource = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

test("protected shell removes the signed-in navbar", () => {
  assert.doesNotMatch(shellSource, /AppShellNav/);
  assert.doesNotMatch(shellSource, /<header/);
  assert.match(shellSource, /Blindspots home/);
  assert.match(shellSource, /fixed left-3 top-3/);
  assert.match(shellSource, /<main className=/);
});

test("root route hydrates dashboard summary into the single-page workspace", () => {
  assert.match(homePageSource, /getDashboardSummary/);
  assert.match(homePageSource, /<ProtectedAppShell/);
  assert.match(homePageSource, /dashboardSummary=\{summary\}/);
});

test("train route is only a compatibility alias back to root", () => {
  assert.match(trainPageSource, /redirect\(query \? `\/\?\$\{query\}` : "\/"\)/);
  assert.doesNotMatch(trainPageSource, /getDashboardSummary/);
});

test("training workspace renders minified dashboard drawers around the board", () => {
  assert.match(trainClientSource, /function WorkspaceDrawer/);
  assert.match(trainClientSource, /function WorkspaceImportPosition/);
  assert.match(trainClientSource, /function WorkspaceQueueOverview/);
  assert.match(trainClientSource, /dashboardSummary\?: DashboardSummary/);
  assert.match(trainClientSource, /sidebarsHidden/);
  assert.match(trainClientSource, /hideWorkspaceSidebars/);
  assert.match(trainClientSource, /top-\[4\.75rem\]/);
  assert.match(trainClientSource, /md:flex/);
  assert.match(trainClientSource, /md:hidden/);
});

test("workspace shell uses a static non-animated grid", () => {
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(css, /\.app-ambient::before/);
  assert.doesNotMatch(shellSource, /pointermove/);
  assert.doesNotMatch(css, /app-grid-led-pulse|app-grid-led-drift/);
});

test("postmortem remains inside the same single-page workspace", () => {
  assert.match(trainClientSource, /WorkspacePostmortemDrawer/);
  assert.doesNotMatch(trainClientSource, /router\.push\("\/dashboard"\)/);
  assert.match(trainClientSource, /setSidebarsHidden\(false\)/);
});

test("import position replaces the start-position CTA", () => {
  assert.match(trainClientSource, /Import position/);
  assert.doesNotMatch(trainClientSource, />Start position</);
});

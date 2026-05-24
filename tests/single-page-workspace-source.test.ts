import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync("components/protected-app-shell.tsx", "utf8");
const homePageSource = readFileSync("app/page.tsx", "utf8");
const spaSource = readFileSync("components/blindspots-spa-prototype.tsx", "utf8");
const trainPageSource = readFileSync("app/(shell)/train/page.tsx", "utf8");
const trainClientSource = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

test("protected shell removes the signed-in navbar", () => {
  assert.doesNotMatch(shellSource, /AppShellNav/);
  assert.doesNotMatch(shellSource, /<header/);
  assert.match(shellSource, /Blindspots home/);
  assert.match(shellSource, /grid-rows-\[56px_1fr\]/);
  assert.match(shellSource, /<main className=/);
});

test("root route renders the imported SPA replacement", () => {
  assert.match(homePageSource, /<BlindspotsSpaPrototype \/>/);
  assert.doesNotMatch(homePageSource, /getDashboardSummary/);
  assert.doesNotMatch(homePageSource, /<ProtectedAppShell/);
  assert.doesNotMatch(homePageSource, /<TrainPage/);
});

test("train route is only a compatibility alias back to root", () => {
  assert.match(trainPageSource, /redirect\(query \? `\/\?\$\{query\}` : "\/"\)/);
  assert.doesNotMatch(trainPageSource, /getDashboardSummary/);
});

test("SPA replacement uses the imported index.html layout vocabulary", () => {
  assert.match(spaSource, /bs-kit-topbar/);
  assert.match(spaSource, /bs-kit-workspace/);
  assert.match(spaSource, /bs-kit-board-pane/);
  assert.match(spaSource, /bs-kit-sidebar/);
  assert.match(spaSource, /Add FEN/);
  assert.doesNotMatch(spaSource, /Copy FEN|Black to move|Postmortem|Notes hidden/);
});

test("workspace shell uses a quiet static paper surface", () => {
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(css, /\.app-ambient::before/);
  assert.match(css, /\.app-ambient::before[\s\S]*content: none/);
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync("components/protected-app-shell.tsx", "utf8");
const homePageSource = readFileSync("app/page.tsx", "utf8");
const spaSource = readFileSync("components/blindspots-spa-prototype.tsx", "utf8");
const signOutSource = readFileSync("components/auth-sign-out-button.tsx", "utf8");
const trainPageSource = readFileSync("app/(shell)/train/page.tsx", "utf8");
const trainClientSource = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

test("protected shell removes the signed-in navbar", () => {
  assert.doesNotMatch(shellSource, /AppShellNav/);
  assert.doesNotMatch(shellSource, /<header/);
  assert.doesNotMatch(shellSource, /Blindspots home/);
  assert.doesNotMatch(shellSource, /blindspots<span/);
  assert.doesNotMatch(shellSource, /grid-rows-\[56px_1fr\]/);
  assert.match(shellSource, /h-\[100dvh\]/);
  assert.match(shellSource, /<main className=/);
});

test("root route renders the imported SPA replacement", () => {
  assert.match(homePageSource, /<BlindspotsSpaPrototype initialTheme=\{initialTheme\} \/>/);
  assert.doesNotMatch(homePageSource, /getDashboardSummary/);
  assert.doesNotMatch(homePageSource, /<ProtectedAppShell/);
  assert.doesNotMatch(homePageSource, /<TrainPage/);
});

test("train route is only a compatibility alias back to root", () => {
  assert.match(trainPageSource, /redirect\(query \? `\/\?\$\{query\}` : "\/"\)/);
  assert.doesNotMatch(trainPageSource, /getDashboardSummary/);
});

test("SPA replacement uses the imported index.html layout vocabulary", () => {
  assert.match(spaSource, /bs-kit-shell-actions/);
  assert.match(spaSource, /initialTheme: AppTheme/);
  assert.match(spaSource, /useState<AppTheme>\(initialTheme\)/);
  assert.match(spaSource, /document\.documentElement\.dataset\.theme = theme;/);
  assert.match(spaSource, /bs-kit-workspace/);
  assert.match(spaSource, /bs-kit-board-pane/);
  assert.match(spaSource, /bs-kit-sidebar/);
  assert.doesNotMatch(spaSource, /bs-kit-brand/);
  assert.doesNotMatch(spaSource, /LogoIcon/);
  assert.doesNotMatch(spaSource, /Copy FEN|Black to move|Postmortem|Notes hidden/);
});

test("SPA shell toolbar keeps visible labels and adds a sign-out icon", () => {
  const shellActionsSource = spaSource.slice(
    spaSource.indexOf("function ShellActions"),
    spaSource.indexOf("function PlayerStrip"),
  );

  assert.match(shellActionsSource, /<PlusIcon \/> Add FEN/);
  assert.match(shellActionsSource, /<SettingsIcon \/>[\s\S]*<span>Settings<\/span>/);
  assert.match(shellActionsSource, /<AuthSignOutButton className="bs-kit-btn-quiet" \/>/);
  assert.match(signOutSource, /function SignOutIcon/);
  assert.match(signOutSource, /<SignOutIcon \/>/);
  assert.match(signOutSource, /Sign Out/);
});

test("SPA workspace uses a Chessbook-style centered responsive cluster", () => {
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(css, /--bs-workspace-gap: 36px/);
  assert.match(css, /--bs-board-max: 480px/);
  assert.match(css, /--bs-sidebar-width: 424px/);
  assert.match(css, /--bs-sidebar-pad-x: 24px/);
  assert.match(css, /--bs-workspace-max:/);
  assert.match(css, /\.bs-kit-shell-actions[\s\S]*right: max\(\s*var\(--bs-sidebar-pad-x\)/);
  assert.match(css, /\.bs-kit-workspace[\s\S]*width: min\(100%, var\(--bs-workspace-max\)\)/);
  assert.match(css, /\.bs-kit-workspace[\s\S]*margin: 0 auto/);
  assert.match(css, /\.bs-kit-workspace[\s\S]*grid-template-columns: minmax\(0, var\(--bs-board-max\)\) var\(--bs-sidebar-width\)/);
  assert.match(css, /\.bs-kit-sidebar[\s\S]*padding: 30px var\(--bs-sidebar-pad-x\)/);
  assert.match(css, /@media \(min-width: 1280px\)[\s\S]*--bs-board-max: 520px/);
  assert.match(css, /@media \(min-width: 1536px\)[\s\S]*--bs-board-max: 650px/);
  assert.doesNotMatch(css, /grid-template-columns: minmax\(0, 1fr\) 424px/);
  assert.doesNotMatch(css, /calc\(100vw - 520px\)/);
  assert.doesNotMatch(spaSource, /document\.documentElement\.dataset\.theme = "";/);
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

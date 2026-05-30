import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const spaSource = readFileSync("components/clone/clone-spa.tsx", "utf8");
const cssSource = readFileSync("app/globals.css", "utf8");

test("clone SPA reuses the old board-first chrome classes", () => {
  assert.match(spaSource, /<ShellActions/);
  assert.match(spaSource, /<PathRoot segments=\{pathRootSegmentsForState\(state\)\}/);
  assert.match(spaSource, /className="bs-kit-shell-actions"/);
  assert.match(spaSource, /className="bs-kit-path-root"/);
  assert.match(spaSource, /className="bs-kit-board-actions"/);
  assert.match(cssSource, /\.bs-kit-shell-actions/);
  assert.match(cssSource, /\.bs-kit-path-root/);
  assert.match(cssSource, /\.bs-kit-board-actions/);
});

test("clone SPA chrome handles theme, settings, sign out, and playing board controls", () => {
  assert.match(spaSource, /fetch\("\/auth\/theme\/save"/);
  assert.match(spaSource, /window\.location\.assign\("\/auth\/sign-out"\)/);
  assert.match(spaSource, /settingsOpen/);
  assert.match(spaSource, /role="dialog"/);
  assert.match(spaSource, /Linked profile/);
  assert.match(spaSource, /setFlipped\(\(value\) => !value\)/);
  assert.match(spaSource, /handleRestartGame/);
  assert.match(spaSource, /\/abandon/);
  assert.match(spaSource, /state\.screen === "playing"/);
  assert.equal(existsSync("app/api/clone/game/[id]/abandon/route.ts"), true);
});

test("clone SPA keeps the old shell and deleted routes out", () => {
  assert.equal(existsSync("components/protected-app-shell.tsx"), false);
  assert.equal(existsSync("app/(shell)/train/page.tsx"), false);
  assert.equal(existsSync("app/(shell)/analyze/page.tsx"), false);
  assert.equal(existsSync("app/(shell)/dashboard/page.tsx"), false);
  assert.equal(existsSync("app/(shell)/account/page.tsx"), false);
  assert.doesNotMatch(spaSource, /ProtectedAppShell|app-shell-nav/);
});

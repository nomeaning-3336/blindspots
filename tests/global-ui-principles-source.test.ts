import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layoutSource = readFileSync("app/layout.tsx", "utf8");
const cssSource = readFileSync("app/globals.css", "utf8");
const trainSource = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

test("global fonts avoid the generic geometric AI look", () => {
  assert.match(layoutSource, /Space_Grotesk/);
  assert.match(layoutSource, /JetBrains_Mono/);
  assert.doesNotMatch(layoutSource, /Source_Serif_4|IBM_Plex_Mono/);
  assert.match(cssSource, /--font-sans: var\(--font-space-grotesk\), "Space Grotesk"/);
  assert.match(cssSource, /--font-mono: var\(--font-jetbrains-mono\), "JetBrains Mono"/);
});

test("design system defaults to paper with dark as the only alternate", () => {
  assert.match(cssSource, /--app-bg: #f4f1ea/);
  assert.match(cssSource, /html\[data-theme="dark"\]/);
  assert.doesNotMatch(cssSource, /#6d5a8f|#efe6fb|#b39ae0/);
});

test("global surfaces use restrained elevation instead of heavy brutal shadows", () => {
  assert.match(cssSource, /--app-elevation-1/);
  assert.match(cssSource, /\.app-brutal-section[\s\S]*box-shadow: var\(--app-elevation-1\)/);
  assert.match(cssSource, /\.app-brutal-board-frame[\s\S]*box-shadow: var\(--app-elevation-2\)/);
  assert.doesNotMatch(cssSource, /\.app-brutal-section[\s\S]{0,180}4px 4px 0/);
});

test("workspace controls meet touch and focus basics", () => {
  const workspaceSource = trainSource.slice(
    trainSource.indexOf("function WorkspaceDrawer"),
    trainSource.indexOf("function OnboardingPreferencesModal"),
  );

  assert.match(workspaceSource, /min-h-11/);
  assert.match(workspaceSource, /focus-visible:outline/);
  assert.match(workspaceSource, /motion-reduce:transition-none/);
});

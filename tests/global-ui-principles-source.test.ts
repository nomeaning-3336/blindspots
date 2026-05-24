import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layoutSource = readFileSync("app/layout.tsx", "utf8");
const cssSource = readFileSync("app/globals.css", "utf8");
const trainSource = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

test("global fonts avoid the generic geometric AI look", () => {
  assert.doesNotMatch(layoutSource, /Space_Grotesk|JetBrains_Mono/);
  assert.match(layoutSource, /Source_Serif_4/);
  assert.match(layoutSource, /IBM_Plex_Mono/);
  assert.match(cssSource, /--font-sans: "Inter", "Aptos", "Segoe UI"/);
  assert.match(cssSource, /--font-display: var\(--font-display\), Georgia/);
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

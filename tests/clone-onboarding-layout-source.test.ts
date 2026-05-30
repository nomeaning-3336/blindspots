import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("app/globals.css", "utf8");
const onboardingSource = readFileSync("components/clone/clone-onboarding.tsx", "utf8");
const spaSource = readFileSync("components/clone/clone-spa.tsx", "utf8");

function mediaBlock(query: string) {
  const start = css.indexOf(query);
  assert.notEqual(start, -1);
  const next = css.indexOf("\n@media", start + query.length);
  return css.slice(start, next === -1 ? undefined : next);
}

test("clone onboarding keeps board and panel side by side through tablet widths", () => {
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*--bs-board-max: min\(44vw, 420px\)/);
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*--bs-sidebar-width: min\(42vw, 380px\)/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*grid-template-columns: 1fr/);
  assert.doesNotMatch(mediaBlock("@media (max-width: 900px)"), /\.clone-workspace/);
});

test("clone onboarding renders as compact sidebar content inside the SPA shell", () => {
  assert.match(spaSource, /<AnalysisBoard/);
  assert.match(spaSource, /const boardDisabled = onboardingScreen \|\| isPostmortem \|\| cloneThinking/);
  assert.match(spaSource, /<aside className="bs-kit-sidebar"/);
  assert.match(spaSource, /<CloneOnboarding/);
  assert.doesNotMatch(onboardingSource, /p-8 shadow-lg/);
  assert.doesNotMatch(spaSource, /p-8 shadow-lg/);
  assert.match(onboardingSource, /p-6"/);
});

test("clone playing mode explicitly has no side panel", () => {
  assert.match(spaSource, /const hasPanel = onboardingScreen \|\| isPostmortem/);
  assert.match(spaSource, /data-panel=\{hasPanel \? "true" : "false"\}/);
});

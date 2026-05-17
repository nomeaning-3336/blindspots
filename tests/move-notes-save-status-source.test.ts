import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("move notes panel only flushes user-edited notes", () => {
  const source = readFileSync("components/train/mistake-memory-panel.tsx", "utf8");

  assert.match(source, /const pendingEditedRef = useRef\(false\);/);
  assert.match(source, /pendingEditedRef\.current = true;/);
  assert.match(source, /pendingEditedRef\.current = false;/);
  assert.match(
    source,
    /if \(pendingKeyRef\.current && pendingTextRef\.current !== null && pendingEditedRef\.current\)/,
  );
  assert.match(source, /\{savedMoveKey && savedMoveKey\.startsWith\(row\.decisionFen\) \? \(/);
  assert.doesNotMatch(source, /\{savedMoveKey\.startsWith\(row\.decisionFen\) \? \(/);
});

test("move notes thumbnail row is not a native button wrapping board buttons", () => {
  const source = readFileSync("components/train/mistake-memory-panel.tsx", "utf8");
  const thumbnailHeaderSource = source.slice(
    source.indexOf("{/* Row header"),
    source.indexOf("{/* Expanded editor */"),
  );

  assert.match(thumbnailHeaderSource, /<div\s+role="button"\s+tabIndex=\{0\}/);
  assert.match(thumbnailHeaderSource, /onKeyDown=\{\(event\) => \{/);
  assert.match(thumbnailHeaderSource, /event\.key !== "Enter" && event\.key !== " "/);
  assert.doesNotMatch(thumbnailHeaderSource, /<button/);
});

test("train client clears stale saved-note status when selected postmortem position changes", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  assert.match(
    source,
    /useEffect\(\(\) => \{\s*setSavedMoveNoteKey\(null\);\s*\}, \[selectedMoveIndex\]\);/,
  );
});

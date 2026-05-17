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
  assert.match(source, /const currentMoveKey = currentUci \? buildMoveKey\(row\.decisionFen, currentUci\) : null;/);
  assert.match(source, /\{savedMoveKey && currentMoveKey && savedMoveKey === currentMoveKey \? \(/);
  assert.doesNotMatch(source, /savedMoveKey\.startsWith\(row\.decisionFen\)/);
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

test("move notes row shows the queued position FEN beside the thumbnail", () => {
  const source = readFileSync("components/train/mistake-memory-panel.tsx", "utf8");
  const thumbnailHeaderSource = source.slice(
    source.indexOf("{/* Row header"),
    source.indexOf("{/* Expanded editor */"),
  );

  assert.match(thumbnailHeaderSource, /title=\{row\.decisionFen\}/);
  assert.match(thumbnailHeaderSource, /FEN: \{row\.decisionFen\}/);
  assert.match(thumbnailHeaderSource, /truncate/);
});

test("train client clears stale saved-note status when selected postmortem position changes", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  assert.match(
    source,
    /useEffect\(\(\) => \{\s*setSavedMoveNoteKey\(null\);\s*\}, \[selectedMoveIndex\]\);/,
  );
});

test("train client keeps saved-note status until the next user action", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const syncSource = source.slice(
    source.indexOf("if (currentText === sentNoteText)"),
    source.indexOf("} else if (reason !== \"flush\")"),
  );

  assert.match(syncSource, /setSavedMoveNoteKey\(key\)/);
  assert.doesNotMatch(syncSource, /setTimeout/);
  assert.doesNotMatch(syncSource, /2000/);
});

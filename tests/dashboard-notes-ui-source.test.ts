import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = () => readFileSync("components/dashboard-client.tsx", "utf8");

test("dashboard queue notes use one minimal position note editor", () => {
  const dashboard = source();
  const rowSource = dashboard.slice(
    dashboard.indexOf("function QueuePositionRow"),
    dashboard.indexOf("function DeleteConfirmationModal"),
  );
  const notesColumn = rowSource.slice(rowSource.indexOf("{/* Notes column */}"));

  assert.match(rowSource, /const positionNote = notes\[0\] \?\? null/);
  assert.match(notesColumn, /aria-label=\{positionNote \? "Edit note" : "Create note"\}/);
  assert.match(notesColumn, /<path d="M9 2 L12 5 L5 12 L2 12 L2 9 Z"/);
  assert.doesNotMatch(notesColumn, /notes\.length > 0/);
  assert.doesNotMatch(notesColumn, /min-w-5/);
  assert.doesNotMatch(notesColumn, /M7 2 L7 12 M2 7 L12 7/);
  assert.doesNotMatch(notesColumn, /aria-label="Delete note"/);
  assert.doesNotMatch(notesColumn, />\s*Save\s*</);
  assert.doesNotMatch(notesColumn, />\s*Cancel\s*</);
});

test("dashboard queue note editors autosave without explicit footer buttons", () => {
  const dashboard = source();

  assert.match(dashboard, /document\.addEventListener\("pointerdown", onPointerDown\)/);
  assert.match(dashboard, /if \(note\) submitEdit\(note\)/);
  assert.match(dashboard, /void saveNewNote\(\)/);
});

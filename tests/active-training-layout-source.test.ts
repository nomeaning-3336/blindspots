import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("active training board reserves vertical space for action buttons", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const classSource = source.slice(
    source.indexOf("const boardFrameClassName"),
    source.indexOf("const preplayBoardHandoffClassName"),
  );

  assert.match(classSource, /isExploringResults\s*\?\s*"w-\[min\(88vw,calc\(100dvh-10\.25rem\),836px\)\]"/);
  assert.match(classSource, /:\s*"w-\[min\(82vw,calc\(100dvh-12\.5rem\),800px\)\]"/);
  assert.doesNotMatch(classSource, /w-\[min\(78vw,calc\(100dvh-18rem\),760px\)\]/);
  assert.doesNotMatch(classSource, /lg:translate-x-\[5vw\]/);
  assert.match(classSource, /grid-rows-\[auto_auto_auto\]/);
  assert.match(classSource, /lg:grid-rows-\[auto_auto\]/);
  assert.match(classSource, /content-center/);
  assert.match(classSource, /lg:items-center/);
  assert.doesNotMatch(classSource, /lg:items-start/);
});

test("active training right rail keeps notes container and buttons beside board", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const activeRailSource = source.slice(
    source.indexOf("{!isPostMortemVisible ? ("),
    source.indexOf("{isPostMortemVisible ? ("),
  );
  const railSource = source.slice(
    source.indexOf("function TrainingNotesRail"),
    source.indexOf("function formatRelativeTime"),
  );

  assert.match(activeRailSource, /<aside className="flex min-h-0 w-full flex-col gap-4 lg:w-\[320px\]">/);
  assert.doesNotMatch(activeRailSource, /<AttemptRegistryAside/);
  assert.match(activeRailSource, /<TrainingNotesRail/);
  assert.doesNotMatch(railSource, /if \(notes\.length === 0\)/);
  assert.match(railSource, /<aside className="flex min-h-\[360px\] w-full flex-col rounded-xl/);
  assert.match(railSource, /notes\.length > 0 \? \(/);
  assert.match(railSource, /<div className="mt-auto grid gap-3 pt-4">/);
  assert.doesNotMatch(railSource, /N\/A/);
  assert.match(railSource, /lg:min-h-\[420px\]/);
  assert.doesNotMatch(railSource, /lg:min-h-\[520px\]/);
});

test("active train sidebar shows only notes and action buttons", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const activeRailSource = source.slice(
    source.indexOf("{!isPostMortemVisible ? ("),
    source.indexOf("{isPostMortemVisible ? ("),
  );

  assert.doesNotMatch(activeRailSource, /Previous Mistakes Here/);
  assert.match(activeRailSource, /<TrainingNotesRail/);
  assert.match(activeRailSource, /Copy FEN/);
  assert.match(activeRailSource, /Skip Position/);
  assert.match(activeRailSource, /Return to Dashboard/);
});

test("active board no longer has placeholder eval-bar gutter", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  assert.doesNotMatch(source, /data-testid="active-board-size-reserve"/);
  assert.doesNotMatch(source, /data-testid="active-eval-bar-placeholder"/);
});

test("deleted move note keys are tombstoned and prevented from reappearing", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");

  // deletedMoveNoteKeysRef exists as a tombstone set
  assert.match(source, /deletedMoveNoteKeysRef\s*=\s*useRef<Set<string>>\(new Set\(\)\)/);

  // syncDirtyMoveNoteKeys skips tombstoned keys before POST
  assert.match(source, /deletedMoveNoteKeysRef\.current\.has\(key\)[^]*?dirty\.delete\(key\)[^]*?continue;/);

  // notesByFen skips tombstones
  assert.match(source, /deletedMoveNoteKeysRef\.current\.has\(entry\.moveKey\)/);

  // normalizeTrainingNotes filters tombstoned rows
  assert.match(source, /deletedMoveNoteKeysRef\.current\.has\(key\)[^]*?return false/);

  // surfacedNotesForFen fetch filters tombstones
  assert.match(source, /deletedMoveNoteKeysRef\.current\.has\(key\)[^]*?return !key \|\| !deletedMoveNoteKeysRef\.current\.has\(key\)/);

  // Postmortem load-existing-notes skips tombstones
  assert.match(source, /deletedMoveNoteKeysRef\.current\.has\(moveKey\)/);

  // handleSaveNote removes tombstone when saving non-empty text
  assert.match(source, /deletedMoveNoteKeysRef\.current\.delete\(moveKey\)/);

  // handleUpdateNote removes tombstone when saving non-empty text
  assert.match(source, /function handleUpdateNote[^]*?deletedMoveNoteKeysRef\.current\.delete\(moveKey\)/);

  // syncDirtyMoveNoteKeys has tombstone check before POST
  const syncFnStart = source.indexOf("function syncDirtyMoveNoteKeys");
  const syncFnBody = source.slice(syncFnStart, syncFnStart + 800);
  assert.match(syncFnBody, /deletedMoveNoteKeysRef\.current\.has\(key\)/);
  assert.match(syncFnBody, /dirty\.delete\(key\)/);
  assert.match(syncFnBody, /continue/);
});

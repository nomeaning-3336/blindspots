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
  assert.match(classSource, /state === "active" && !trainOnboardingIntroActive\s*\?\s*"w-\[min\(88vw,calc\(100dvh-10\.25rem\),836px\)\]"/);
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
  assert.match(activeRailSource, /<AttemptRegistryAside/);
  assert.match(activeRailSource, /<TrainingNotesRail/);
  assert.doesNotMatch(railSource, /if \(notes\.length === 0\)/);
  assert.match(railSource, /<aside className="flex min-h-\[360px\] w-full flex-col rounded-xl/);
  assert.match(railSource, /notes\.length > 0 \? \(/);
  assert.match(railSource, /<div className="mt-auto grid gap-3 pt-4">/);
  assert.doesNotMatch(railSource, /N\/A/);
  assert.match(railSource, /lg:min-h-\[420px\]/);
  assert.doesNotMatch(railSource, /lg:min-h-\[520px\]/);
});

test("active board reserves the same external eval-bar slot as postmortem", () => {
  const source = readFileSync("app/(shell)/train/train-client.tsx", "utf8");
  const activeBoardSource = source.slice(
    source.indexOf("<div className=\"relative w-full overflow-visible pl-9\" data-testid=\"active-board-size-reserve\">"),
    source.indexOf("</BoardWithPlayerStrips>"),
  );

  assert.match(activeBoardSource, /data-testid="active-board-size-reserve"/);
  assert.match(activeBoardSource, /data-testid="active-eval-bar-placeholder"/);
  assert.match(activeBoardSource, /opacity-20/);
  assert.match(activeBoardSource, /<AnalysisBoard/);
  assert.ok(
    activeBoardSource.indexOf("active-eval-bar-placeholder") <
      activeBoardSource.indexOf("<AnalysisBoard"),
  );
  assert.ok(
    activeBoardSource.indexOf("active-board-size-reserve") <
      activeBoardSource.indexOf("<AnalysisBoard"),
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePlayableTrainingFen } from "../lib/training/position-validity.ts";

const spaSource = readFileSync("components/blindspots-spa-prototype.tsx", "utf8");
const addRouteSource = readFileSync("app/api/position/add/route.ts", "utf8");
const activeRouteSource = readFileSync("app/api/train/active-session/route.ts", "utf8");
const storeSource = readFileSync("lib/training/active-session-store.ts", "utf8");

test("Add FEN route validates playability before persisting", () => {
  assert.match(addRouteSource, /import \{ validatePlayableTrainingFen \}/);
  assert.match(addRouteSource, /const playable = validatePlayableTrainingFen\(decisionFen\);/);
  assert.match(addRouteSource, /if \(!playable\.ok\)/);
  // Persisted as a generic personal training item with manual app origin.
  assert.match(addRouteSource, /source_type: "app_training"/);
  assert.match(addRouteSource, /user_training_items/);
});

test("Add FEN validation accepts a playable position and rejects junk and terminal positions", () => {
  // Playable starting position.
  assert.equal(
    validatePlayableTrainingFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").ok,
    true,
  );
  // Invalid FEN.
  assert.equal(validatePlayableTrainingFen("not a fen").ok, false);
  // Checkmate (terminal, no move to train).
  assert.equal(
    validatePlayableTrainingFen("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3").ok,
    false,
  );
});

test("SPA Add FEN sheet posts decisionFen to the add API and surfaces server errors", () => {
  assert.match(spaSource, /fetch\("\/api\/position\/add", \{/);
  assert.match(spaSource, /body: JSON\.stringify\(\{ decisionFen: fen \}\)/);
  assert.match(spaSource, /data-testid="spa-add-fen-error"/);
  // The sheet reports success back to the shell so it can close.
  assert.match(spaSource, /onAdded\(\)/);
});

test("SPA exposes a quiet non-grading discard escape for active and blocked sessions", () => {
  assert.match(spaSource, /data-testid="spa-discard-sequence"/);
  assert.match(spaSource, /async function discardActiveSequence\(\)/);
  // Discard invalidates in-flight sync so a late flush cannot resurrect it.
  assert.match(spaSource, /syncGenerationRef\.current \+= 1;[\s\S]*?completionRequestedGenerationRef\.current = null;/);
  assert.match(spaSource, /method: "DELETE"/);
  // Discard is offered even when a legacy non-Maia session blocks the board.
  assert.match(spaSource, /activeSession !== null \|\| legacySessionBlocked/);
});

test("Discard endpoint and store abandon a session without grading it", () => {
  assert.match(activeRouteSource, /export async function DELETE\(request: Request\)/);
  assert.match(activeRouteSource, /abandonActiveTrainingSession/);

  assert.match(storeSource, /export async function abandonActiveTrainingSession/);
  // Only uncompleted rows are eligible; deletion does not grade or mutate Elo/SRS/cursor.
  assert.match(storeSource, /\.delete\(\)[\s\S]*?\.is\("completed_at", null\)/);
  const abandonBody = storeSource.slice(
    storeSource.indexOf("export async function abandonActiveTrainingSession"),
    storeSource.indexOf("export async function updateActiveTrainingSessionMoves"),
  );
  assert.doesNotMatch(abandonBody, /blindspots_elo/);
  assert.doesNotMatch(abandonBody, /rating_deviation/);
  assert.doesNotMatch(abandonBody, /next_filler_cursor/);
  assert.doesNotMatch(abandonBody, /user_training_items/);
});

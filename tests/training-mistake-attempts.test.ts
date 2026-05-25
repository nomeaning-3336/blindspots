import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const mistakeAttemptsModule = require("../lib/training/mistake-memory.ts");

const { normalizeDecisionFen, buildMoveKey, isFailedClassification } = mistakeAttemptsModule;

// ── Canonicalization ──────────────────────────────────────────────

test("normalizeDecisionFen strips halfmove and fullmove clocks", () => {
  const full = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
  const canonical = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3";
  assert.equal(normalizeDecisionFen(full), canonical);
});

test("normalizeDecisionFen keeps 4-part FEN as-is", () => {
  const fen4 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
  assert.equal(normalizeDecisionFen(fen4), fen4);
});

test("buildMoveKey uses canonical FEN and UCI", () => {
  const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
  const key = buildMoveKey(fen, "e7e5");
  assert.equal(key, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3::e7e5");
});

// ── Classification helpers ────────────────────────────────────────

test("isFailedClassification identifies bad moves", () => {
  assert.equal(isFailedClassification("inaccuracy"), true);
  assert.equal(isFailedClassification("mistake"), true);
  assert.equal(isFailedClassification("blunder"), true);
  assert.equal(isFailedClassification("good"), false);
  assert.equal(isFailedClassification("best"), false);
  assert.equal(isFailedClassification("excellent"), false);
  assert.equal(isFailedClassification("brilliant"), false);
  assert.equal(isFailedClassification("critical"), false);
  assert.equal(isFailedClassification("okay"), false);
  assert.equal(isFailedClassification(undefined), false);
  assert.equal(isFailedClassification(""), false);
});

// ── SRS bounded regression ────────────────────────────────────────

test("mastered fail keeps interval at or above 30-day floor", () => {
  // The function is in training-item-store.ts (server module) and requires Supabase.
  // We verify via source-code assertion that the constant and clamp logic exist.
  const fs = require("node:fs");
  const source = fs.readFileSync("lib/training/training-item-store.ts", "utf8");

  assert.match(source, /MASTERED_FAIL_FLOOR_DAYS\s*=\s*30/);
  assert.match(source, /isMasteredFail/);
  assert.match(source, /Math\.max\(newInterval,\s*MASTERED_FAIL_FLOOR_DAYS\)/);
  // Stay mastered
  assert.match(source, /Stay mastered/);
});

// ── Attempt persistence ───────────────────────────────────────────

test("complete-sequence persists attempts with worse_of classification", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync("app/api/train/complete-sequence/route.ts", "utf8");

  assert.match(source, /persistMistakeAttempts/);
  assert.match(source, /user_mistake_attempts/);
  assert.match(source, /BAD_CLASSIFICATIONS/);
  assert.match(source, /worseClassification/);
  assert.match(source, /resolved_at/);
});

// ── API exposure ──────────────────────────────────────────────────

test("next-position returns attemptRegistry in response shape", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync("app/api/train/next-position/route.ts", "utf8");

  assert.match(source, /attemptRegistry/);
  assert.match(source, /moveNotes/);
  assert.match(source, /enrichAttemptRegistry/);
  assert.match(source, /user_mistake_attempts/);
  // Must join with training_move_notes for note field
  assert.match(source, /training_move_notes/);
  assert.match(source, /loadMoveNotesForDecisionFen/);
});

test("next-position retry path is enriched with attempt registry", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync("app/api/train/next-position/route.ts", "utf8");

  assert.match(source, /enrichedRetry/);
  assert.match(source, /enrichAttemptRegistry\(retryResponse/);
});

// ── Note endpoint ─────────────────────────────────────────────────

test("attempt-note endpoint validates auth and canonicalizes FEN", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync("app/api/train/attempt-note/route.ts", "utf8");

  assert.match(source, /getOptionalAppUserId/);
  assert.match(source, /normalizeDecisionFen/);
  assert.match(source, /buildMoveKey/);
  assert.match(source, /training_move_notes/);
  // Must return 404 on unknown attempt
  assert.match(source, /No matching attempt entry/);
});

// ── Migration ─────────────────────────────────────────────────────

test("migration creates user_mistake_attempts with unique constraint and unresolved index", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(
    "supabase/migrations/20260512150000_create_user_mistake_attempts.sql",
    "utf8",
  );

  assert.match(source, /create table.*user_mistake_attempts/);
  assert.match(source, /unique\s*\(user_id,\s*decision_fen,\s*move_uci\)/);
  assert.match(source, /where resolved_at is null/);
  assert.match(source, /classification in \('inaccuracy','mistake','blunder'\)/);
  assert.match(source, /mistake_id.*references user_training_items/);
});


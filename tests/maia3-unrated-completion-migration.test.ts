import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readMigration(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      "supabase",
      "migrations",
      "20260527090000_complete_maia_unrated_sessions.sql",
    ),
    "utf8",
  );
}

test("Maia unrated completion migration preserves atomic completion without rating mutations", () => {
  const source = readMigration();

  assert.ok(source.includes("drop function if exists public.finalize_training_session_atomic("));
  assert.ok(source.includes("p_is_rated boolean default true"));
  assert.ok(source.includes("if p_is_rated and v_session.selected_training_item_id is not null then"));
  assert.ok(source.includes("blindspots_elo = case when p_is_rated then p_elo_after else blindspots_elo end"));
  assert.ok(source.includes("rating_deviation = case when p_is_rated then p_rating_deviation_after else rating_deviation end"));
  assert.ok(source.includes("total_sequences = coalesce(total_sequences, 0) + case when p_is_rated then 1 else 0 end"));
  assert.ok(source.includes("last_session_at = p_completed_at"));
  assert.ok(source.includes("case when v_session.queue_source = 'filler' then 1 else 0 end"));
  assert.ok(source.includes("boolean"));
  assert.ok(source.includes("to service_role;"));
});

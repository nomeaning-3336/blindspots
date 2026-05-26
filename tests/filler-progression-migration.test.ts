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
      "20260526170000_track_server_owned_filler_cursor.sql",
    ),
    "utf8",
  );
}

test("filler progression advances only inside atomic completion of filler sessions", () => {
  const source = readMigration();

  assert.ok(source.includes("add column if not exists next_filler_cursor integer not null default 0"));
  assert.ok(source.includes("user_blindspot_profile_next_filler_cursor_check"));
  assert.ok(source.includes("check (next_filler_cursor >= 0)"));
  assert.ok(source.includes("create or replace function public.finalize_training_session_atomic"));
  assert.ok(source.includes("next_filler_cursor ="));
  assert.ok(source.includes("coalesce(next_filler_cursor, 0)"));
  assert.ok(source.includes("case when v_session.queue_source = 'filler' then 1 else 0 end"));
  assert.ok(source.includes("update public.training_sessions"));
  assert.ok(source.includes("update public.user_training_items"));
  assert.ok(source.includes("update public.user_blindspot_profile"));
});

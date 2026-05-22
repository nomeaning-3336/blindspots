import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { normalizeDecisionFen } from "@/lib/training/mistake-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as {
    decisionFen?: unknown;
    setupPreviousFen?: unknown;
    setupPlayedMoveUci?: unknown;
    setupPlayedMoveSan?: unknown;
  } | null;

  const decisionFen = typeof payload?.decisionFen === "string" ? payload.decisionFen : "";
  const setupPreviousFen =
    typeof payload?.setupPreviousFen === "string" && payload.setupPreviousFen.length > 0
      ? payload.setupPreviousFen
      : null;
  const setupPlayedMoveUci =
    typeof payload?.setupPlayedMoveUci === "string" && payload.setupPlayedMoveUci.length > 0
      ? payload.setupPlayedMoveUci
      : null;
  const setupPlayedMoveSan =
    typeof payload?.setupPlayedMoveSan === "string" && payload.setupPlayedMoveSan.length > 0
      ? payload.setupPlayedMoveSan
      : null;

  if (!decisionFen) {
    return NextResponse.json({ error: "Missing decisionFen" }, { status: 400 });
  }

  const canonicalFen = normalizeDecisionFen(decisionFen);
  const supabase = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { data: existing } = await supabase
    .from("user_mistakes" as any)
    .select("id, status")
    .eq("user_id", userId)
    .eq("starting_fen", canonicalFen)
    .maybeSingle();

  if (existing) {
    const row = existing as unknown as { id: string; status: string };
    if (row.status === "deleted") {
      await supabase
        .from("user_mistakes" as any)
        .update({ status: "active", next_review_at: nowIso, last_attempt_at: null })
        .eq("id", row.id);
    }
    return NextResponse.json({ ok: true, positionId: row.id, deduped: true });
  }

  const { data: inserted, error } = await supabase
    .from("user_mistakes" as any)
    .insert({
      user_id: userId,
      source_type: "app_training",
      source_provider: "blindspots",
      source_game_id: null,
      source_game_url: null,
      ply: null,
      starting_fen: canonicalFen,
      decision_fen: canonicalFen,
      actual_move_uci: null,
      actual_move_san: null,
      result_fen: null,
      setup_previous_fen: setupPreviousFen,
      setup_played_move_uci: setupPlayedMoveUci,
      setup_played_move_san: setupPlayedMoveSan,
      move_key: null,
      classification: null,
      severity: null,
      cp_loss: null,
      eval_before_cp: null,
      eval_after_cp: null,
      mate_before: null,
      mate_after: null,
      status: "active",
      next_review_at: nowIso,
      last_attempt_at: null,
      fail_count: 0,
      pass_count: 0,
      review_count: 0,
      consecutive_correct_count: 0,
      theme_tags: [],
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `Add failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, positionId: (inserted as any)?.id ?? null, deduped: false });
}

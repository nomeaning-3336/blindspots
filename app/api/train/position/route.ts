import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/app-auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeNotes } from "@/lib/notes";
import { isValidFen } from "@/lib/training/corpus-helpers";
import { normalizeDecisionFen } from "@/lib/training/mistake-memory";

export async function GET(request: NextRequest) {
  const userId = await requireAppAuth("/train");

  const trainingItemId = request.nextUrl.searchParams.get("positionId") ?? request.nextUrl.searchParams.get("trainingItemId");
  if (!trainingItemId) {
    return NextResponse.json({ error: "Missing positionId parameter" }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();

  const { data: mistake, error } = await supabase
    .from("user_training_items")
    .select("*")
    .eq("id", trainingItemId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load position" }, { status: 500 });
  }

  const m = mistake as unknown as Record<string, unknown>;

  if (!isValidFen(m.starting_fen as string)) {
    return NextResponse.json({ error: "Invalid FEN in position" }, { status: 422 });
  }

  const decisionFen = normalizeDecisionFen((m.decision_fen as string) ?? (m.starting_fen as string));
  const { data: noteRows } = await supabase
    .from("training_move_notes" as any)
    .select("move_key, decision_fen, move_san, move_uci, classification, note_text, eval_before_cp, eval_after_cp")
    .eq("user_id", userId)
    .eq("decision_fen", decisionFen)
    .order("last_attempted_at", { ascending: false });

  return NextResponse.json({
    trainingItemId: m.id,
    fen: m.starting_fen,
    decisionFen,
    previousFen: (m.setup_previous_fen as string) ?? undefined,
    playedMove: (m.setup_played_move_uci as string) ?? undefined,
    actualMoveUci: (m.actual_move_uci as string) ?? undefined,
    actualMoveSan: (m.actual_move_san as string) ?? undefined,
    queueSource: m.source_type === "app_training" ? "active_mistake" : m.source_type,
    reviewCount: (m.review_count as number) ?? 0,
    cpLoss: (m.cp_loss as number) ?? undefined,
    openingName: (m.opening_name as string) ?? undefined,
    source: m.source_type,
    selectedServeMode: "exact_queue_position",
    selectedBucket: m.status,
    moveNotes: normalizeNotes((noteRows as any[] | null) ?? []),
  });
}



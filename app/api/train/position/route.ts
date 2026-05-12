import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/app-auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isValidFen } from "@/lib/training/corpus-helpers";

export async function GET(request: NextRequest) {
  const userId = await requireAppAuth("/train");

  const mistakeId = request.nextUrl.searchParams.get("positionId") ?? request.nextUrl.searchParams.get("mistakeId");
  if (!mistakeId) {
    return NextResponse.json({ error: "Missing positionId parameter" }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();

  const { data: mistake, error } = await supabase
    .from("user_mistakes")
    .select("*")
    .eq("id", mistakeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load position" }, { status: 500 });
  }

  const m = mistake as unknown as Record<string, unknown>;

  if (!isValidFen(m.starting_fen as string)) {
    return NextResponse.json({ error: "Invalid FEN in position" }, { status: 422 });
  }

  return NextResponse.json({
    mistakeId: m.id,
    fen: m.starting_fen,
    decisionFen: m.starting_fen,
    previousFen: (m.setup_previous_fen as string) ?? undefined,
    playedMove: (m.setup_played_move_uci as string) ?? undefined,
    actualMoveUci: (m.actual_move_uci as string) ?? undefined,
    actualMoveSan: (m.actual_move_san as string) ?? undefined,
    queueSource: m.source_type,
    cpLoss: (m.cp_loss as number) ?? undefined,
    openingName: (m.opening_name as string) ?? undefined,
    source: m.source_type,
    selectedServeMode: "exact_queue_position",
    selectedBucket: m.status,
  });
}

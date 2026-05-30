// @ts-nocheck — clone tables not yet in generated Supabase types
import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdminClient();

  const { data: game } = await supabase
    .from("clone_games")
    .select(
      "id, user_color, clone_color, starting_fen, current_fen, moves_uci, result, state"
    )
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  return NextResponse.json({
    game: {
      id: game.id,
      userColor: game.user_color,
      cloneColor: game.clone_color,
      startingFen: game.starting_fen,
      currentFen: game.current_fen,
      movesUci: game.moves_uci as string[],
      result: game.result,
      state: game.state,
    },
  });
}

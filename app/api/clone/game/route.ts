// @ts-nocheck — clone tables not yet in generated Supabase types
import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();

  // Find trained clone for this user
  const { data: clone } = await supabase
    .from("user_clones")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "ready")
    .maybeSingle();

  if (!clone) {
    return NextResponse.json({ error: "No trained clone found" }, { status: 404 });
  }

  // MVP: always white for user, black for clone
  const userColor = "white";
  const cloneColor = "black";
  const startingFen =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  const { data: game, error } = await supabase
    .from("clone_games")
    .insert({
      user_id: userId,
      clone_id: clone.id,
      user_color: userColor,
      clone_color: cloneColor,
      starting_fen: startingFen,
      current_fen: startingFen,
      moves_uci: [],
      state: "playing",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create game" }, { status: 500 });
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

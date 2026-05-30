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

  const gameSelect =
    "id, user_color, clone_color, starting_fen, current_fen, moves_uci, result, state";

  function toView(game: Record<string, unknown>) {
    return {
      id: game.id,
      userColor: game.user_color,
      cloneColor: game.clone_color,
      startingFen: game.starting_fen,
      currentFen: game.current_fen,
      movesUci: game.moves_uci as string[],
      result: game.result,
      state: game.state,
    };
  }

  async function findPlayingGame() {
    const { data } = await supabase
      .from("clone_games")
      .select(gameSelect)
      .eq("user_id", userId)
      .eq("clone_id", clone.id)
      .eq("state", "playing")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  }

  // Idempotent: reuse an existing playing game rather than spawning a
  // duplicate on refresh, double-mount, double-click, or StrictMode.
  const existing = await findPlayingGame();
  if (existing) {
    return NextResponse.json({ game: toView(existing) });
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
    .select(gameSelect)
    .single();

  if (error) {
    // A concurrent request likely won the partial unique index race
    // (clone_games_one_playing_per_user_idx). Fall back to that game.
    const raced = await findPlayingGame();
    if (raced) {
      return NextResponse.json({ game: toView(raced) });
    }
    return NextResponse.json({ error: "Failed to create game" }, { status: 500 });
  }

  return NextResponse.json({ game: toView(game) });
}

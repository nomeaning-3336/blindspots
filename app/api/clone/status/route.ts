// @ts-nocheck — clone tables not yet in generated Supabase types
import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ status: "no-clone" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();

  const { data: clone } = await supabase
    .from("user_clones")
    .select("id, provider, username, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (!clone) {
    return NextResponse.json({ status: "no-clone" });
  }

  // Only restore active playing games, not postmortem
  const { data: activeGame } = await supabase
    .from("clone_games")
    .select(
      "id, user_color, clone_color, starting_fen, current_fen, moves_uci, result, state"
    )
    .eq("user_id", userId)
    .eq("clone_id", clone.id)
    .eq("state", "playing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const activeGameView = activeGame
    ? {
        id: activeGame.id,
        userColor: activeGame.user_color,
        cloneColor: activeGame.clone_color,
        startingFen: activeGame.starting_fen,
        currentFen: activeGame.current_fen,
        movesUci: activeGame.moves_uci as string[],
        result: activeGame.result,
        state: activeGame.state,
      }
    : null;

  return NextResponse.json({
    status: "clone-exists",
    clone: {
      id: clone.id,
      provider: clone.provider,
      username: clone.username,
      status: clone.status,
    },
    activeGame: activeGameView,
  });
}

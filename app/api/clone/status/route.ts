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
    .select("id, provider, username, status, rating")
    .eq("user_id", userId)
    .maybeSingle();

  if (!clone) {
    return NextResponse.json({ status: "no-clone" });
  }

  // Restore the newest non-abandoned game so a refresh during postmortem
  // brings back the board + postmortem panel, not just live games.
  const { data: activeGame } = await supabase
    .from("clone_games")
    .select(
      "id, user_color, clone_color, starting_fen, current_fen, moves_uci, result, state"
    )
    .eq("user_id", userId)
    .eq("clone_id", clone.id)
    .in("state", ["playing", "postmortem"])
    .order("updated_at", { ascending: false })
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
      rating: clone.rating,
    },
    activeGame: activeGameView,
  });
}

// @ts-nocheck — clone tables not yet in generated Supabase types
import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { normalizeChessProvider, normalizeChessUsername } from "@/lib/chess-profile";
import { upsertLinkedChessProfileForUser } from "@/lib/chess-profile-store";
import type { ChessProvider } from "@/lib/chess-profile";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const provider = normalizeChessProvider(body.provider) as ChessProvider;
  const username = normalizeChessUsername(provider, body.username);

  if (!provider || !username) {
    return NextResponse.json({ error: "Invalid provider or username" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  await supabase
    .from("clone_games")
    .update({
      state: "abandoned",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .in("state", ["playing", "postmortem"]);

  // Upsert linked chess profile (reuse existing logic)
  await upsertLinkedChessProfileForUser(userId, {
    provider,
    username,
    linkedAt: new Date().toISOString(),
  });

  // Upsert clone record, resetting all training artifacts
  const { error } = await supabase
    .from("user_clones")
    .upsert(
      {
        user_id: userId,
        provider,
        username,
        status: "needs_training",
        rating: null,
        embedding: null,
        embedding_model: null,
        embedding_version: "maia4all-v1",
        training_error: null,
        trained_at: null,
        source_game_count: 0,
        source_position_count: 0,
        source_started_at: null,
        source_ended_at: null,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

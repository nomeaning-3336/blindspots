// @ts-nocheck — clone tables not yet in generated Supabase types
import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { fetchGamesForProfile } from "@/lib/chess-performance-server";
import { Chess } from "chess.js";
import type { NormalizedGame } from "@/lib/chess-performance-report";

export const dynamic = "force-dynamic";

type CloneTrainingGame = {
  id: string;
  provider: "lichess" | "chesscom";
  userColor: "white" | "black";
  movesUci: string[];
  totalPlies: number;
  timeType: string;
  userRating: number | null;
};

function buildCloneTrainingGames(games: NormalizedGame[]): CloneTrainingGame[] {
  return games
    .map((g) => {
      let movesUci: string[] = [];

      if (typeof g.movesUci === "string" && g.movesUci.trim().length > 0) {
        movesUci = g.movesUci.split(/\s+/).filter(Boolean);
      } else if (typeof g.pgn === "string" && g.pgn.trim().length > 0) {
        try {
          const chess = new Chess();
          chess.loadPgn(g.pgn);
          movesUci = chess.history({ verbose: true }).map((m) => {
            const uci = m.from + m.to;
            return m.promotion ? uci + m.promotion : uci;
          });
        } catch {
          return null;
        }
      } else {
        return null;
      }

      if (movesUci.length === 0) return null;

      try {
        const replay = new Chess();
        for (const uci of movesUci) {
          const from = uci.slice(0, 2);
          const to = uci.slice(2, 4);
          const promotion = uci.length > 4 ? uci.slice(4) : undefined;
          const applied = replay.move({ from, to, promotion });
          if (!applied) return null;
        }
      } catch {
        return null;
      }

      return {
        id: g.id,
        provider: g.provider,
        userColor: g.userColor,
        movesUci,
        totalPlies: movesUci.length,
        timeType: g.timeType,
        userRating: g.userRating,
      };
    })
    .filter((g): g is CloneTrainingGame => g !== null);
}

export async function POST() {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();

  // Get clone record — allow needs_training, failed, or stale training
  const { data: clone } = await supabase
    .from("user_clones")
    .select("id, provider, username, status, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!clone) {
    return NextResponse.json({ error: "No clone found" }, { status: 404 });
  }

  const isStaleTraining =
    clone.status === "training" &&
    new Date(clone.updated_at).getTime() < Date.now() - 2 * 60 * 1000;

  if (
    clone.status !== "needs_training" &&
    clone.status !== "failed" &&
    !isStaleTraining
  ) {
    return NextResponse.json(
      { error: "Clone is not in a trainable state" },
      { status: 409 }
    );
  }

  // Update status to training
  await supabase
    .from("user_clones")
    .update({ status: "training", updated_at: new Date().toISOString() })
    .eq("id", clone.id);

  try {
    // Fetch recent games (last 90 days, generous limit)
    const sinceMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const games = await fetchGamesForProfile(
      { provider: clone.provider, username: clone.username, linkedAt: "" },
      sinceMs
    );

    const trainingGames = buildCloneTrainingGames(
      [...games].sort((a, b) => b.endTimeMs - a.endTimeMs)
    ).slice(0, 20);

    if (trainingGames.length < 20) {
      // Revert to needs_training on insufficient games
      await supabase
        .from("user_clones")
        .update({ status: "needs_training", updated_at: new Date().toISOString() })
        .eq("id", clone.id);

      return NextResponse.json(
        { error: "insufficient_games", found: trainingGames.length },
        { status: 409 }
      );
    }

    const totalPlies = trainingGames.reduce((sum, g) => sum + g.totalPlies, 0);

    // MVP placeholder:128-length zero vector
    const placeholderEmbedding = Array.from({ length: 128 }, () => 0);

    await supabase
      .from("user_clones")
      .update({
        status: "ready",
        embedding: placeholderEmbedding,
        embedding_model: "placeholder-random-v0",
        embedding_version: "placeholder-v0",
        source_game_count: trainingGames.length,
        source_position_count: totalPlies,
        trained_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", clone.id);

    return NextResponse.json({
      ok: true,
      sourceGameCount: trainingGames.length,
      sourcePositionCount: totalPlies,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    await supabase
      .from("user_clones")
      .update({
        status: "failed",
        training_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clone.id);

    return NextResponse.json(
      { error: "training_failed", message },
      { status: 500 }
    );
  }
}

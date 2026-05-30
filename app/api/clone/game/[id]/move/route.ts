// @ts-nocheck — clone tables not yet in generated Supabase types
import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { Chess } from "chess.js";

export const dynamic = "force-dynamic";

function generateRandomLegalMove(chess: Chess): string {
  const moves = chess.moves({ verbose: true });
  const m = moves[Math.floor(Math.random() * moves.length)];
  return `${m.from}${m.to}${m.promotion ?? ""}`;
}

function resolveGameResult(chess: Chess): "white" | "black" | "draw" {
  if (chess.isDraw()) return "draw";
  if (chess.isCheckmate()) {
    return chess.turn() === "w" ? "black" : "white";
  }
  return "draw";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const uci: string = body.uci;

  if (!uci || typeof uci !== "string") {
    return NextResponse.json({ error: "Missing uci" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  const { data: game } = await supabase
    .from("clone_games")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!game || game.state !== "playing") {
    return NextResponse.json({ error: "Game not found or not active" }, { status: 404 });
  }

  const movesUci = (game.moves_uci as string[]) ?? [];

  // Validate turn ownership: user is white, so user moves on even plies (0, 2, 4...)
  if (movesUci.length % 2 !== 0) {
    return NextResponse.json({ error: "Not your turn" }, { status: 400 });
  }

  // Validate and apply user move
  const chess = new Chess(game.current_fen);
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length === 5 ? uci[4] : undefined;

  const move = chess.move({ from, to, promotion });
  if (!move) {
    return NextResponse.json({ error: "Illegal move" }, { status: 400 });
  }

  const fenAfterUser = chess.fen();
  const userPly = movesUci.length + 1;

  // Record user move event
  await supabase.from("clone_game_events").insert({
    game_id: game.id,
    ply: userPly,
    actor: "user",
    fen_before: game.current_fen,
    move_uci: uci,
    fen_after: fenAfterUser,
  });

  // Check if game is over after user move
  if (chess.isGameOver()) {
    const result = resolveGameResult(chess);
    await supabase
      .from("clone_games")
      .update({
        current_fen: fenAfterUser,
        moves_uci: [...movesUci, uci],
        result,
        state: "postmortem",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", game.id);

    return NextResponse.json({
      game: {
        id: game.id,
        userColor: game.user_color,
        cloneColor: game.clone_color,
        startingFen: game.starting_fen,
        currentFen: fenAfterUser,
        movesUci: [...movesUci, uci],
        result,
        state: "postmortem",
      },
      cloneMove: null,
    });
  }

  // Generate clone move (random legal for MVP)
  const cloneMoveUci = generateRandomLegalMove(chess);
  const chessAfterClone = new Chess(fenAfterUser);
  const cloneMove = chessAfterClone.move({
    from: cloneMoveUci.slice(0, 2),
    to: cloneMoveUci.slice(2, 4),
    promotion: cloneMoveUci.length === 5 ? cloneMoveUci[4] : undefined,
  });

  if (!cloneMove) {
    // Should not happen with random selection, but guard anyway
    return NextResponse.json({ error: "Clone move generation failed" }, { status: 500 });
  }

  const fenAfterClone = chessAfterClone.fen();
  const clonePly = userPly + 1;

  // Record clone move event
  await supabase.from("clone_game_events").insert({
    game_id: game.id,
    ply: clonePly,
    actor: "clone",
    fen_before: fenAfterUser,
    move_uci: cloneMoveUci,
    fen_after: fenAfterClone,
    model: "placeholder-random-v0",
  });

  // Check if game is over after clone move
  const finalResult = chessAfterClone.isGameOver() ? resolveGameResult(chessAfterClone) : null;

  await supabase
    .from("clone_games")
    .update({
      current_fen: fenAfterClone,
      moves_uci: [...movesUci, uci, cloneMoveUci],
      result: finalResult,
      state: finalResult ? "postmortem" : "playing",
      completed_at: finalResult ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", game.id);

  return NextResponse.json({
    game: {
      id: game.id,
      userColor: game.user_color,
      cloneColor: game.clone_color,
      startingFen: game.starting_fen,
      currentFen: fenAfterClone,
      movesUci: [...movesUci, uci, cloneMoveUci],
      result: finalResult,
      state: finalResult ? "postmortem" : "playing",
    },
    cloneMove: cloneMoveUci,
  });
}

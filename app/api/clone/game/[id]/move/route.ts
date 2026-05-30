// @ts-nocheck — clone tables not yet in generated Supabase types
import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { Chess } from "chess.js";

export const dynamic = "force-dynamic";

const MAIA4ALL_MOVE_TIMEOUT_MS = 30000;

type Maia4AllMoveResponse = {
  uci?: unknown;
  policy?: unknown;
};

function resolveGameResult(chess: Chess): "white" | "black" | "draw" {
  if (chess.isDraw()) return "draw";
  if (chess.isCheckmate()) {
    return chess.turn() === "w" ? "black" : "white";
  }
  return "draw";
}

function getMaia4AllUrl() {
  return process.env.MAIA4ALL_URL?.replace(/\/+$/, "") ?? null;
}

function parseEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 128) return null;
  const embedding = value.map((entry) => Number(entry));
  if (!embedding.every((entry) => Number.isFinite(entry))) return null;
  return embedding;
}

async function requestMaia4AllMove({
  maia4AllUrl,
  fen,
  embedding,
}: {
  maia4AllUrl: string;
  fen: string;
  embedding: number[];
}) {
  const response = await fetch(`${maia4AllUrl}/v1/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      fen,
      embedding,
      temperature: 0.85,
      topP: 0.95,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(MAIA4ALL_MOVE_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Maia4All move failed with status ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`
    );
  }

  const payload = (await response.json()) as Maia4AllMoveResponse;
  if (typeof payload.uci !== "string") {
    throw new Error("Maia4All returned a missing move");
  }

  return {
    uci: payload.uci,
    policy: payload.policy ?? null,
  };
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

  const { data: clone } = await supabase
    .from("user_clones")
    .select("id, status, embedding, embedding_model, embedding_version")
    .eq("id", game.clone_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!clone || clone.status !== "ready") {
    return NextResponse.json({ error: "Clone is not ready" }, { status: 409 });
  }

  const embedding = parseEmbedding(clone.embedding);
  if (!embedding) {
    return NextResponse.json({ error: "Clone embedding is invalid" }, { status: 409 });
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

  // Check if game is over after user move
  if (chess.isGameOver()) {
    const result = resolveGameResult(chess);
    await supabase.from("clone_game_events").insert({
      game_id: game.id,
      ply: userPly,
      actor: "user",
      fen_before: game.current_fen,
      move_uci: uci,
      fen_after: fenAfterUser,
    });

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

  const maia4AllUrl = getMaia4AllUrl();
  if (!maia4AllUrl) {
    return NextResponse.json({ error: "maia4all_not_configured" }, { status: 503 });
  }

  let maiaMove;
  try {
    maiaMove = await requestMaia4AllMove({
      maia4AllUrl,
      fen: fenAfterUser,
      embedding,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown Maia4All move error";
    return NextResponse.json(
      { error: "maia4all_move_failed", message },
      { status: 502 }
    );
  }

  const cloneMoveUci = maiaMove.uci;
  const chessAfterClone = new Chess(fenAfterUser);
  const cloneMove = chessAfterClone.move({
    from: cloneMoveUci.slice(0, 2),
    to: cloneMoveUci.slice(2, 4),
    promotion: cloneMoveUci.length === 5 ? cloneMoveUci[4] : undefined,
  });

  if (!cloneMove) {
    return NextResponse.json(
      { error: "maia4all_illegal_move", uci: cloneMoveUci },
      { status: 502 }
    );
  }

  const fenAfterClone = chessAfterClone.fen();
  const clonePly = userPly + 1;

  await supabase.from("clone_game_events").insert([
    {
      game_id: game.id,
      ply: userPly,
      actor: "user",
      fen_before: game.current_fen,
      move_uci: uci,
      fen_after: fenAfterUser,
    },
    {
      game_id: game.id,
      ply: clonePly,
      actor: "clone",
      fen_before: fenAfterUser,
      move_uci: cloneMoveUci,
      fen_after: fenAfterClone,
      model:
        typeof clone.embedding_version === "string" && clone.embedding_version.length > 0
          ? `${clone.embedding_model}@${clone.embedding_version}`
          : clone.embedding_model,
      move_policy: maiaMove.policy,
    },
  ]);

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

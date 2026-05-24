import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { classifyEngineError, getOpponentMove } from "@/lib/engines/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRAIN_ENGINE_TIME_LIMIT_MS = 1000;

type OpponentMovePayload = {
  fen?: unknown;
  userBlindspotElo?: unknown;
  previousEvalCp?: unknown;
  challengeElo?: unknown;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as OpponentMovePayload | null;
  const fen = typeof payload?.fen === "string" ? payload.fen : "";

  const chess = parseFen(fen);

  if (!chess) {
    return NextResponse.json({ error: "Invalid FEN." }, { status: 400 });
  }

  if (chess.isGameOver() || chess.moves().length === 0) {
    return NextResponse.json(
      { error: "No legal opponent move available." },
      { status: 409 },
    );
  }

  try {
    const move = await getOpponentMove(
      fen,
      normalizeElo(payload?.userBlindspotElo),
      normalizeOptionalNumber(payload?.previousEvalCp),
      {
        responseDelayMs: 0,
        timeLimitMs: TRAIN_ENGINE_TIME_LIMIT_MS,
        targetElo: normalizeOptionalNumber(payload?.challengeElo),
        skipRefinement: true,
      },
    );

    return NextResponse.json({ move });
  } catch (error) {
    const code = classifyEngineError(error);
    return NextResponse.json(
      { error: code === "engine_timeout" ? "Engine timed out." : "No legal opponent move available." },
      { status: code === "engine_timeout" ? 504 : 409 },
    );
  }
}

function parseFen(fen: string) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

function normalizeElo(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 1200;
}

function normalizeOptionalNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

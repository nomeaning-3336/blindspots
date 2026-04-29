import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { getOpponentMove } from "@/lib/engines/dispatcher";

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

  if (!isValidFen(fen)) {
    return NextResponse.json({ error: "Invalid FEN." }, { status: 400 });
  }

  const move = await getOpponentMove(
    fen,
    normalizeElo(payload?.userBlindspotElo),
    normalizeOptionalNumber(payload?.previousEvalCp),
    {
      responseDelayMs: 0,
      timeLimitMs: TRAIN_ENGINE_TIME_LIMIT_MS,
      targetElo: normalizeOptionalNumber(payload?.challengeElo),
    },
  );

  return NextResponse.json({ move });
}

function isValidFen(fen: string) {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
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

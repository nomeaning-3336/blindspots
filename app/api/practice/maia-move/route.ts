import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import maia2Service from "@/services/maia2/service";

interface MaiaMoveRequestBody {
  fen?: unknown;
  eloSelf?: unknown;
  eloOppo?: unknown;
  modelType?: unknown;
  topK?: unknown;
  topMoves?: unknown;
  temperature?: unknown;
  seed?: unknown;
}

function clampInt(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}

function clampFloat(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as MaiaMoveRequestBody | null;
    const fen = String(body?.fen || "").trim();
    if (!fen) {
      return NextResponse.json({ error: "FEN is required." }, { status: 400 });
    }

    try {
      new Chess(fen);
    } catch {
      return NextResponse.json({ error: "Invalid FEN." }, { status: 400 });
    }

    const result = await maia2Service.getMaiaMove({
      fen,
      eloSelf: clampInt(body?.eloSelf, 600, 3000, 1500),
      eloOppo: clampInt(body?.eloOppo, 600, 3000, 1500),
      modelType: body?.modelType === "rapid" ? "rapid" : "blitz",
      topK: clampInt(body?.topK, 1, 24, 8),
      topMoves: clampInt(body?.topMoves, 1, 24, 8),
      temperature: clampFloat(body?.temperature, 0, 2.5, 1),
      seed: Number.isFinite(Number(body?.seed)) ? Number(body?.seed) : undefined,
    });

    return NextResponse.json({
      move: result.move,
      modelType: result.modelType,
      eloSelf: result.eloSelf,
      eloOppo: result.eloOppo,
      winProb: result.winProb,
      topMoves: result.topMoves,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Opponent move request failed.",
      },
      { status: 500 },
    );
  }
}

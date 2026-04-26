import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getLegalMoveLines, classifyEngineError, type EngineErrorCode } from "@/lib/engines/dispatcher";
import { classifyMoveAgainstBest } from "@/lib/move-classification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PieceLinesPayload = {
  fen?: unknown;
  square?: unknown;
};

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as PieceLinesPayload | null;
  const fen = typeof payload?.fen === "string" ? payload.fen : "";
  const square = typeof payload?.square === "string" ? payload.square : "";

  if (!isValidFen(fen) || !square) {
    return NextResponse.json({ error: "Invalid position or square." }, { status: 400 });
  }

  let lines: Awaited<ReturnType<typeof getLegalMoveLines>> = [];
  let engineError: EngineErrorCode | null = null;

  try {
    lines = await getLegalMoveLines(fen, { depthLimit: 18 });
  } catch (error: unknown) {
    engineError = classifyEngineError(error);
    console.error(`[piece-lines] Engine error for fen=${fen} square=${square}:`, error);
  }

  const bestLine = lines[0] ?? null;
  const selectedSquareLines = lines.filter((line) => line.bestMove.slice(0, 2) === square);

  return NextResponse.json({
    ok: engineError === null,
    error: engineError,
    lines: selectedSquareLines.map((line) => ({
      cp: line.cp,
      depth: line.depth,
      rank: line.rank,
      bestMove: line.bestMove,
      bestSan: uciToSan(fen, line.bestMove),
      pv: line.pv,
      pvSan: pvToSan(fen, line.pv),
      classification: classifyMoveAgainstBest(bestLine, line, fen),
    })),
  });
}

function isValidFen(fen: string) {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

function uciToSan(fen: string, uci: string) {
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
    return move?.san ?? uci;
  } catch {
    return uci;
  }
}

function pvToSan(fen: string, pv: string[]) {
  const chess = new Chess(fen);
  const san: string[] = [];
  for (const uci of pv.slice(0, 8)) {
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
    if (!move) break;
    san.push(move.san);
  }
  return san;
}

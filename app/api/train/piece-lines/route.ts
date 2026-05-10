import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getPositionEval, classifyEngineError, type EngineErrorCode } from "@/lib/engines/dispatcher";
import { classifyMoveAgainstBest } from "@/lib/move-classification";
import { getAnalyzePreferencesForUser } from "@/lib/analyze-preferences-store";
import { normalizeAnalyzePreferences } from "@/lib/analyze-preferences";

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
  const legalMoves = legalMovesFromSquare(fen, square);
  if (legalMoves.length === 0) {
    return NextResponse.json({ ok: true, error: null, lines: [] });
  }

  const rawPrefs = await getAnalyzePreferencesForUser(userId);
  const { limitKind, timeLimitValue, depthLimitValue } = normalizeAnalyzePreferences(rawPrefs);

  let lines: PieceMoveEvalLine[] = [];
  let engineError: EngineErrorCode | null = null;

  try {
    lines = await evaluateLegalPieceMoves(fen, legalMoves, {
      depthLimit: limitKind === "depth" ? depthLimitValue : undefined,
      timeLimitMs: limitKind === "time" ? timeLimitValue : undefined,
    });
  } catch (error: unknown) {
    engineError = classifyEngineError(error);
    console.error(`[piece-lines] Engine error for fen=${fen} square=${square}:`, error);
  }

  const bestLine = lines[0] ?? null;

  return NextResponse.json({
    ok: engineError === null,
    error: engineError,
    lines: lines.map((line) => ({
      cp: line.cp,
      depth: line.depth,
      rank: line.rank,
      bestMove: line.bestMove,
      bestSan: uciToSan(fen, line.bestMove),
      pv: line.pv,
      pvSan: pvToSan(fen, line.pv),
      continuationSan: continuationSan(fen, line.bestMove, line.pv),
      classification: classifyMoveAgainstBest(bestLine, line, fen),
    })),
  });
}

type PieceMoveEvalLine = {
  cp: number;
  mate?: number | null;
  depth: number;
  rank: number;
  bestMove: string;
  pv: string[];
};

function legalMovesFromSquare(fen: string, square: string) {
  try {
    const chess = new Chess(fen);
    return chess.moves({ square: square as any, verbose: true }).map((move) => ({
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    }));
  } catch {
    return [];
  }
}

async function evaluateLegalPieceMoves(
  fen: string,
  legalMoves: ReturnType<typeof legalMovesFromSquare>,
  options: { depthLimit?: number; timeLimitMs?: number },
): Promise<PieceMoveEvalLine[]> {
  const perMoveDepth = Math.max(6, Math.min(12, options.depthLimit ?? 10));
  const perMoveTimeLimitMs = options.timeLimitMs
    ? Math.max(80, Math.min(350, Math.round(options.timeLimitMs / Math.max(1, legalMoves.length))))
    : 220;
  const lines: PieceMoveEvalLine[] = [];

  for (const move of legalMoves) {
    const resultingFen = applyMoveToFen(fen, move.uci);
    if (!resultingFen) continue;

    const evalResult = await getPositionEval(resultingFen, {
      depthLimit: perMoveDepth,
      timeLimitMs: perMoveTimeLimitMs,
    });

    const continuation = evalResult.bestMove ? [move.uci, evalResult.bestMove] : [move.uci];
    lines.push({
      cp: evalResult.cp,
      mate: evalResult.mate ?? null,
      depth: evalResult.depth,
      rank: 0,
      bestMove: move.uci,
      pv: continuation,
    });
  }

  const isBlackToMove = fen.split(/\s+/)[1] === "b";
  return lines
    .sort((left, right) => isBlackToMove ? left.cp - right.cp : right.cp - left.cp)
    .map((line, index) => ({ ...line, rank: index }));
}

function applyMoveToFen(fen: string, uci: string) {
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
    return move ? chess.fen() : null;
  } catch {
    return null;
  }
}

function continuationSan(fen: string, bestMove: string, pv: string[]) {
  const continuation = Array.isArray(pv) && pv[0] === bestMove ? pv.slice(1) : pv;
  return pvToSan(fen, continuation);
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

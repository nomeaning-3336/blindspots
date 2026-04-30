import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getPositionLines, getLegalMoveLines, classifyEngineError, type EngineErrorCode } from "@/lib/engines/dispatcher";
import { type EngineLine } from "@/lib/engines/types";
import { getAnalyzePreferencesForUser } from "@/lib/analyze-preferences-store";
import { normalizeAnalyzePreferences } from "@/lib/analyze-preferences";
import { classifyRankedMove, classifyMoveAgainstBest, type MoveEvaluationLine } from "@/lib/move-classification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRAIN_ENGINE_TIME_LIMIT_MS = 1000;

type EngineLinesPayload = {
  fen?: unknown;
};

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as EngineLinesPayload | null;
  const fen = typeof payload?.fen === "string" ? payload.fen : "";
  if (!isValidFen(fen)) {
    return NextResponse.json({ error: "Invalid position." }, { status: 400 });
  }

  const rawPrefs = await getAnalyzePreferencesForUser(userId);
  const { linesShown, limitKind, timeLimitValue, depthLimitValue } = normalizeAnalyzePreferences(rawPrefs);

  let pvLines: Awaited<ReturnType<typeof getPositionLines>> = [];
  let engineError: EngineErrorCode | null = null;

  try {
    pvLines = await getPositionLines(fen, {
      depthLimit: limitKind === "depth" ? depthLimitValue : undefined,
      timeLimitMs: limitKind === "time" ? timeLimitValue : TRAIN_ENGINE_TIME_LIMIT_MS,
      multiPv: linesShown,
    });
  } catch (error: unknown) {
    engineError = classifyEngineError(error);
    console.error(`[engine-lines] Engine error for fen=${fen}:`, error);
  }

  // Scan legal candidate moves to find same-tier moves missing from MultiPV top-N.
  let candidateLines: Awaited<ReturnType<typeof getLegalMoveLines>> = [];
  try {
    candidateLines = await getLegalMoveLines(fen, {
      depthLimit: limitKind === "depth" ? depthLimitValue : undefined,
      timeLimitMs: limitKind === "time" ? timeLimitValue : TRAIN_ENGINE_TIME_LIMIT_MS,
    });
  } catch {
    // Best-effort candidate scan — silently skip if it fails.
  }

  const SAME_TIER_CP_THRESHOLD = 35;
  const MAX_TOTAL_LINES = Math.max(linesShown + 3, 6);

  function sameTierAsBest(best: MoveEvaluationLine | null | undefined, line: MoveEvaluationLine) {
    if (!best) return false;
    if (typeof best.mate === "number" || typeof line.mate === "number") {
      return best.mate === line.mate;
    }
    return Math.abs((best.cp ?? 0) - (line.cp ?? 0)) <= SAME_TIER_CP_THRESHOLD;
  }

  const merged: Array<EngineLine & { source: "multipv" | "candidate" }> = [];
  const seenBestMoves = new Set<string>();

  for (const line of pvLines) {
    if (!line.bestMove || seenBestMoves.has(line.bestMove)) continue;
    seenBestMoves.add(line.bestMove);
    merged.push({ ...line, source: "multipv" });
  }

  const bestLine = candidateLines[0] ?? pvLines[0] ?? null;

  for (const line of candidateLines) {
    if (merged.length >= MAX_TOTAL_LINES) break;
    if (!line.bestMove || seenBestMoves.has(line.bestMove)) continue;
    if (!sameTierAsBest(bestLine, line)) continue;
    seenBestMoves.add(line.bestMove);
    merged.push({ ...line, source: "candidate" });
  }

  return NextResponse.json({
    ok: engineError === null,
    error: engineError,
    lines: merged.map((line, index) => ({
      cp: line.cp,
      mate: line.mate,
      depth: line.depth,
      rank: line.rank,
      bestMove: line.bestMove,
      bestSan: uciToSan(fen, line.bestMove),
      pv: line.pv,
      pvSan: pvToSan(fen, line.pv),
      source: line.source,
      classification:
        line.source === "candidate"
          ? classifyMoveAgainstBest(bestLine, line, fen)
          : classifyRankedMove(index, merged, fen),
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

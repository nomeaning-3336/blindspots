import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getPositionLines, classifyEngineError, type EngineErrorCode } from "@/lib/engines/dispatcher";
import { getAnalyzePreferencesForUser } from "@/lib/analyze-preferences-store";
import { normalizeAnalyzePreferences } from "@/lib/analyze-preferences";
import { classifyRankedMove } from "@/lib/move-classification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const { linesShown } = normalizeAnalyzePreferences(rawPrefs);

  let lines: Awaited<ReturnType<typeof getPositionLines>> = [];
  let engineError: EngineErrorCode | null = null;

  try {
    lines = await getPositionLines(fen, { depthLimit: 18, multiPv: linesShown });
  } catch (error: unknown) {
    engineError = classifyEngineError(error);
    console.error(`[engine-lines] Engine error for fen=${fen}:`, error);
  }

  return NextResponse.json({
    ok: engineError === null,
    error: engineError,
    lines: lines.map((line, index) => ({
      cp: line.cp,
      depth: line.depth,
      rank: line.rank,
      bestMove: line.bestMove,
      bestSan: uciToSan(fen, line.bestMove),
      pv: line.pv,
      pvSan: pvToSan(fen, line.pv),
      classification: classifyRankedMove(index, lines, fen),
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

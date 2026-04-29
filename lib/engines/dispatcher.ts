import { stockfishHarness, EngineError } from "./stockfish";
import type { EngineMove } from "./types";
import { getOpponentElo } from "@/lib/training/elo";
import { Chess } from "chess.js";
import type { Square } from "chess.js";

export { EngineError };

export type EngineErrorCode = "engine_timeout" | "engine_unavailable" | "engine_error";

export function classifyEngineError(error: unknown): EngineErrorCode {
  if (error instanceof EngineError) return error.code;
  return "engine_error";
}

export async function getOpponentMove(
  fen: string,
  userBlindspotElo: number,
  previousEvalCp?: number,
  options: {
    responseDelayMs?: number;
    targetElo?: number;
    timeLimitMs?: number;
  } = {},
): Promise<EngineMove> {
  const targetElo =
    typeof options.targetElo === "number"
      ? options.targetElo
      : resolveOpponentTargetElo(userBlindspotElo);
  return stockfishHarness.getMove(fen, {
    targetElo,
    userBlindspotElo,
    previousEvalCp,
    responseDelayMs: options.responseDelayMs,
    timeLimitMs: options.timeLimitMs,
  });
}

export async function getPositionEval(
  fen: string,
  options: { depthLimit?: number; timeLimitMs?: number } = {},
) {
  return stockfishHarness.getEval(fen, {
    depthLimit: options.depthLimit ?? 16,
    timeLimitMs: options.timeLimitMs,
  });
}

export async function getPositionLines(
  fen: string,
  options: { depthLimit?: number; multiPv?: number; timeLimitMs?: number } = {},
) {
  return stockfishHarness.getLines?.(fen, {
    depthLimit: options.depthLimit ?? 18,
    multiPv: options.multiPv ?? 5,
    timeLimitMs: options.timeLimitMs,
  }) ?? [];
}

export async function getPositionMateStatus(
  fen: string,
  options: { depthLimit?: number; timeLimitMs?: number } = {},
) {
  const lines = await getPositionLines(fen, {
    depthLimit: options.depthLimit ?? 14,
    multiPv: 1,
    timeLimitMs: options.timeLimitMs ?? 700,
  });

  const best = lines[0];

  return {
    mate: best?.mate ?? null,
    cp: best?.cp ?? null,
    depth: best?.depth ?? 0,
    bestMove: best?.bestMove ?? null,
  };
}

export async function getLegalMoveLines(
  fen: string,
  options: { depthLimit?: number; timeLimitMs?: number } = {},
) {
  let legalMoves: { from: string; to: string; promotion?: string }[] = [];
  try {
    const chess = new Chess(fen);
    legalMoves = chess.moves({ verbose: true });
  } catch {
    return [];
  }
  if (legalMoves.length === 0) return [];

  const uciMoves = legalMoves.map((move) => `${move.from}${move.to}${move.promotion ?? ""}`);
  return stockfishHarness.getLines?.(fen, {
    depthLimit: options.depthLimit ?? 18,
    multiPv: uciMoves.length,
    searchMoves: uciMoves,
    timeLimitMs: options.timeLimitMs,
  }) ?? [];
}

export async function getPieceLinesFromSquare(
  fen: string,
  square: string,
  options: { depthLimit?: number } = {},
) {
  let legalMoves: { from: string; to: string; promotion?: string }[] = [];
  try {
    const chess = new Chess(fen);
    legalMoves = chess.moves({ square: square as Square, verbose: true });
  } catch {
    return [];
  }
  if (legalMoves.length === 0) return [];

  const uciMoves = legalMoves.map((m) => `${m.from}${m.to}${m.promotion ?? ""}`);

  return stockfishHarness.getLines?.(fen, {
    depthLimit: options.depthLimit ?? 18,
    multiPv: uciMoves.length,
    searchMoves: uciMoves,
  }) ?? [];
}

export async function getEngineAvailability() {
  return {
    stockfish: await stockfishHarness.isAvailable(),
  };
}

export function fallbackChainForElo(_targetElo: number) {
  return ["stockfish"];
}

export function resolveOpponentTargetElo(userBlindspotElo: number) {
  return getOpponentElo(userBlindspotElo);
}

export function fallbackChainForOpponent(userBlindspotElo: number) {
  const targetElo = resolveOpponentTargetElo(userBlindspotElo);
  return {
    targetElo,
    fallbackChain: fallbackChainForElo(targetElo),
  };
}

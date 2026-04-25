import { stockfishHarness } from "./stockfish";
import type { EngineMove } from "./types";
import { getOpponentElo } from "@/lib/training/elo";

export async function getOpponentMove(
  fen: string,
  userBlindspotElo: number,
  previousEvalCp?: number,
  options: { responseDelayMs?: number } = {},
): Promise<EngineMove> {
  const targetElo = resolveOpponentTargetElo(userBlindspotElo);
  return stockfishHarness.getMove(fen, {
    targetElo,
    userBlindspotElo,
    previousEvalCp,
    responseDelayMs: options.responseDelayMs,
  });
}

export async function getPositionEval(fen: string) {
  return stockfishHarness.getEval(fen, { depthLimit: 16 });
}

export async function getPositionLines(fen: string, options: { depthLimit?: number; multiPv?: number } = {}) {
  return stockfishHarness.getLines?.(fen, {
    depthLimit: options.depthLimit ?? 18,
    multiPv: options.multiPv ?? 5,
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

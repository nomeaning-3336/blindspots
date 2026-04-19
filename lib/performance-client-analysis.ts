import type { NormalizedGame, PieceType } from "@/lib/chess-performance-report";

export const CLIENT_ANALYSIS_CACHE_VERSION = 2;
// This widget is intentionally capped so the performance dashboard never turns
// into a full-history engine job on initial page load.
export const CLIENT_ANALYSIS_MAX_GAMES = 30;
export const CLIENT_ANALYSIS_MOVETIME_MS = 35;
export const CLIENT_ANALYSIS_IDLE_BETWEEN_MOVES_MS = 50;
export const CLIENT_ANALYSIS_IDLE_BETWEEN_GAMES_MS = 120;
export const CLIENT_ANALYSIS_ENGINE_INIT_TIMEOUT_MS = 6000;
export const CLIENT_ANALYSIS_EVALUATION_TIMEOUT_MS = 2500;

export type ClientAnalysisPhase = "idle" | "starting" | "running" | "done" | "error";
export type ClientAnalysisStatusReason =
  | "idle"
  | "starting-engine"
  | "analyzing-game"
  | "partial-results"
  | "unavailable";

export interface ClientAnalyzedGame {
  id: string;
  userMoveCpLosses: Array<number | null>;
  userMovePieceTypes: PieceType[];
  analyzedAt: number;
}

export interface ClientAnalysisTaskGame {
  id: string;
  endTimeMs: number;
  userColor: NormalizedGame["userColor"];
  movesUci?: string;
  pgn?: string;
  userMoveCpLosses: Array<number | null>;
  userMovePieceTypes?: PieceType[];
}

export interface ClientAnalysisProgressMessage {
  type: "progress";
  phase: "starting" | "running";
  processedGames: number;
  totalGames: number;
  failedGames: number;
  etaMinutes: number | null;
  currentGameIndex: number | null;
  currentMoveIndex: number | null;
  currentMoveCount: number | null;
  chunk: Array<{
    id: string;
    userMoveCpLosses: Array<number | null>;
    userMovePieceTypes: PieceType[];
  }>;
}

export interface ClientAnalysisDoneMessage {
  type: "done";
  processedGames: number;
  totalGames: number;
  failedGames: number;
}

export interface ClientAnalysisErrorMessage {
  type: "error";
  message: string;
  processedGames: number;
  totalGames: number;
  failedGames: number;
}

export type ClientAnalysisWorkerMessage =
  | ClientAnalysisProgressMessage
  | ClientAnalysisDoneMessage
  | ClientAnalysisErrorMessage;

export interface ClientProcessingStatus {
  phase: ClientAnalysisPhase;
  running: boolean;
  processedGames: number;
  totalGames: number;
  failedGames: number;
  etaMinutes: number | null;
  reason: ClientAnalysisStatusReason;
  currentGameIndex: number | null;
  currentMoveIndex: number | null;
  currentMoveCount: number | null;
  errorMessage: string | null;
}

export class TimeoutError extends Error {
  timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function buildAnalysisCacheKey(profileKeys: string[]) {
  return [
    "perf-client-analysis",
    CLIENT_ANALYSIS_CACHE_VERSION,
    ...profileKeys.sort(),
  ].join(":");
}

export function createIdleClientProcessingStatus(): ClientProcessingStatus {
  return {
    phase: "idle",
    running: false,
    processedGames: 0,
    totalGames: 0,
    failedGames: 0,
    etaMinutes: null,
    reason: "idle",
    currentGameIndex: null,
    currentMoveIndex: null,
    currentMoveCount: null,
    errorMessage: null,
  };
}

export function createStartingClientProcessingStatus(
  totalGames: number,
): ClientProcessingStatus {
  return {
    phase: "starting",
    running: totalGames > 0,
    processedGames: 0,
    totalGames,
    failedGames: 0,
    etaMinutes: null,
    reason: totalGames > 0 ? "starting-engine" : "idle",
    currentGameIndex: totalGames > 0 ? 1 : null,
    currentMoveIndex: null,
    currentMoveCount: null,
    errorMessage: null,
  };
}

export function applyClientAnalysisProgress(
  current: ClientProcessingStatus,
  message: ClientAnalysisProgressMessage,
): ClientProcessingStatus {
  return {
    phase: message.phase,
    running: true,
    processedGames: message.processedGames,
    totalGames: message.totalGames,
    failedGames: message.failedGames,
    etaMinutes: message.etaMinutes,
    reason: message.phase === "starting" ? "starting-engine" : "analyzing-game",
    currentGameIndex: message.currentGameIndex,
    currentMoveIndex: message.currentMoveIndex,
    currentMoveCount: message.currentMoveCount,
    errorMessage: current.errorMessage,
  };
}

export function applyClientAnalysisDone(
  current: ClientProcessingStatus,
  message: ClientAnalysisDoneMessage,
): ClientProcessingStatus {
  return {
    ...current,
    phase: "done",
    running: false,
    processedGames: message.processedGames,
    totalGames: message.totalGames,
    failedGames: message.failedGames,
    etaMinutes: 0,
    reason: current.failedGames > 0 || message.failedGames > 0 ? "partial-results" : "idle",
    currentGameIndex: null,
    currentMoveIndex: null,
    currentMoveCount: null,
  };
}

export function applyClientAnalysisError(
  current: ClientProcessingStatus,
  message: ClientAnalysisErrorMessage,
  hasPartialResults: boolean,
): ClientProcessingStatus {
  return {
    ...current,
    phase: "error",
    running: false,
    processedGames: Math.max(current.processedGames, message.processedGames),
    totalGames: message.totalGames,
    failedGames: Math.max(current.failedGames, message.failedGames),
    etaMinutes: null,
    reason: hasPartialResults ? "partial-results" : "unavailable",
    currentGameIndex: null,
    currentMoveIndex: null,
    currentMoveCount: null,
    errorMessage: message.message,
  };
}

export function selectPendingClientAnalysisGames(
  games: NormalizedGame[],
  analyzedByGame: Record<string, ClientAnalyzedGame>,
  maxGames = CLIENT_ANALYSIS_MAX_GAMES,
): ClientAnalysisTaskGame[] {
  return [...games]
    .filter(
      (game) =>
        game.userMoveCpLosses.length === 0 || (game.userMovePieceTypes?.length ?? 0) === 0,
    )
    .filter((game) => parseMovesUci(game.movesUci).length > 0 || typeof game.pgn === "string")
    .filter((game) => !analyzedByGame[game.id])
    .sort((left, right) => right.endTimeMs - left.endTimeMs)
    .slice(0, maxGames)
    .map((game) => ({
      id: game.id,
      endTimeMs: game.endTimeMs,
      userColor: game.userColor,
      movesUci: game.movesUci,
      pgn: game.pgn,
      userMoveCpLosses: game.userMoveCpLosses,
      userMovePieceTypes: game.userMovePieceTypes,
    }));
}

export function parseClientAnalysisCache(
  raw: string | null,
): Record<string, ClientAnalyzedGame> {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as {
      entries?: Record<string, Partial<ClientAnalyzedGame>>;
    };

    if (!parsed || typeof parsed !== "object" || !parsed.entries) {
      return {};
    }

    const normalizedEntries = Object.entries(parsed.entries).flatMap(([id, value]) => {
      if (!value || typeof value !== "object") return [];
      if (!Array.isArray(value.userMoveCpLosses) || !Array.isArray(value.userMovePieceTypes)) {
        return [];
      }

      return [
        [
          id,
          {
            id,
            userMoveCpLosses: value.userMoveCpLosses.map((entry) =>
              typeof entry === "number" && Number.isFinite(entry) ? entry : null,
            ),
            userMovePieceTypes: value.userMovePieceTypes.filter(isPieceType),
            analyzedAt:
              typeof value.analyzedAt === "number" && Number.isFinite(value.analyzedAt)
                ? value.analyzedAt
                : 0,
          } satisfies ClientAnalyzedGame,
        ] as const,
      ];
    });

    return Object.fromEntries(normalizedEntries);
  } catch {
    return {};
  }
}

export function mergeClientAnalysisEntries(
  current: Record<string, ClientAnalyzedGame>,
  incoming: Array<{
    id: string;
    userMoveCpLosses: Array<number | null>;
    userMovePieceTypes: PieceType[];
  }>,
  analyzedAt: number,
): Record<string, ClientAnalyzedGame> {
  const next = { ...current };

  for (const entry of incoming) {
    next[entry.id] = {
      id: entry.id,
      userMoveCpLosses: [...entry.userMoveCpLosses],
      userMovePieceTypes: [...entry.userMovePieceTypes],
      analyzedAt,
    };
  }

  return next;
}

export function serializeClientAnalysisCache(
  entries: Record<string, ClientAnalyzedGame>,
) {
  return JSON.stringify({ entries });
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new TimeoutError(label, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

export function calculateEtaMinutes(
  elapsedMs: number,
  processedGames: number,
  totalGames: number,
) {
  if (processedGames <= 0 || totalGames <= processedGames) {
    return null;
  }

  const avgPerGame = elapsedMs / processedGames;
  const remainingGames = totalGames - processedGames;
  return roundToTenths((avgPerGame * remainingGames) / 60000);
}

export function parseMovesUci(movesUci?: string) {
  return movesUci
    ?.split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean) ?? [];
}

function isPieceType(value: unknown): value is PieceType {
  return (
    value === "pawn" ||
    value === "knight" ||
    value === "bishop" ||
    value === "rook" ||
    value === "queen" ||
    value === "king"
  );
}

function roundToTenths(value: number) {
  return Math.round(value * 10) / 10;
}

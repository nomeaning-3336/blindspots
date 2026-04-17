import { Chess } from "chess.js";

export type PracticeEngineType = "maia" | "stockfish";
export type PracticePresetKey = "bullet" | "blitz" | "rapid" | "classical";
export type PracticeColor = "w" | "b";
export type PracticeGameStatus =
  | "active"
  | "checkmate"
  | "stalemate"
  | "draw"
  | "timeout"
  | "resigned";

export interface PracticeTimePreset {
  key: PracticePresetKey;
  label: string;
  description: string;
  baseSeconds: number;
  defaultIncrementSeconds: number;
}

export interface PracticeEngineOption {
  key: PracticeEngineType;
  title: string;
  description: string;
}

export interface PracticeMoveRecord {
  ply: number;
  color: PracticeColor;
  uci: string;
  san: string;
  from: string;
  to: string;
  promotion: string | null;
  fenAfter: string;
  clockAfterMs: number;
  spentMs: number;
}

export interface PracticeGameState {
  kind: "practice-game-v1";
  engineType: PracticeEngineType;
  opponentElo: number;
  playerColor: PracticeColor;
  currentFen: string;
  status: PracticeGameStatus;
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  presetKey: PracticePresetKey;
  baseSeconds: number;
  incrementSeconds: number;
  clocksMs: Record<PracticeColor, number>;
  activeColor: PracticeColor;
  orientation: PracticeColor;
  moves: PracticeMoveRecord[];
  lastMoveUci: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface PracticeGameSummary {
  id: string;
  status: PracticeGameStatus;
  engineType: PracticeEngineType;
  opponentElo: number;
  currentFen: string;
  presetKey: PracticePresetKey;
  baseSeconds: number;
  incrementSeconds: number;
  moveCount: number;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string;
}

export interface PracticeStoredGame extends PracticeGameSummary {
  userId: string;
  state: PracticeGameState;
}

export const PRACTICE_START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const PRACTICE_ENGINE_OPTIONS: readonly PracticeEngineOption[] = [
  {
    key: "maia",
    title: "Maia 2",
    description: "Human-like opponent with practical choices and believable mistakes.",
  },
  {
    key: "stockfish",
    title: "Stockfish",
    description: "Computer precision with clock-aware pressure and sharper calculation.",
  },
] as const;

export const PRACTICE_TIME_PRESETS: readonly PracticeTimePreset[] = [
  {
    key: "bullet",
    label: "Bullet",
    description: "Fast hands, quick intuition.",
    baseSeconds: 60,
    defaultIncrementSeconds: 0,
  },
  {
    key: "blitz",
    label: "Blitz",
    description: "Short clock, practical tactics.",
    baseSeconds: 180,
    defaultIncrementSeconds: 2,
  },
  {
    key: "rapid",
    label: "Rapid",
    description: "Balanced pace for real decisions.",
    baseSeconds: 600,
    defaultIncrementSeconds: 5,
  },
  {
    key: "classical",
    label: "Classical",
    description: "Long clock and deeper plans.",
    baseSeconds: 1800,
    defaultIncrementSeconds: 10,
  },
] as const;

export const PRACTICE_INCREMENT_OPTIONS = [0, 1, 2, 3, 5, 10, 15, 30] as const;
export const PRACTICE_MAIA_ELO_OPTIONS = [
  600, 800, 1000, 1200, 1350, 1500, 1700, 1900, 2100, 2300, 2500, 2700,
] as const;
export const PRACTICE_STOCKFISH_ELO_OPTIONS = [
  1350, 1500, 1700, 1900, 2100, 2300, 2500, 2700,
] as const;

export function isPracticeEngineType(value: unknown): value is PracticeEngineType {
  return value === "maia" || value === "stockfish";
}

export function isPracticePresetKey(value: unknown): value is PracticePresetKey {
  return PRACTICE_TIME_PRESETS.some((preset) => preset.key === value);
}

export function getPracticePreset(
  key: PracticePresetKey | null | undefined,
): PracticeTimePreset {
  return (
    PRACTICE_TIME_PRESETS.find((preset) => preset.key === key) ||
    PRACTICE_TIME_PRESETS[1]
  );
}

export function clampPracticeIncrement(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  return PRACTICE_INCREMENT_OPTIONS.includes(
    rounded as (typeof PRACTICE_INCREMENT_OPTIONS)[number],
  )
    ? rounded
    : fallback;
}

export function clampPracticeElo(value: unknown, fallback = 1500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(600, Math.min(3000, Math.round(parsed)));
}

export function createInitialPracticeGameState(options: {
  engineType: PracticeEngineType;
  presetKey: PracticePresetKey;
  incrementSeconds: number;
  opponentElo: number;
  playerColor?: PracticeColor;
}) {
  const preset = getPracticePreset(options.presetKey);
  const now = new Date().toISOString();
  const playerColor = options.playerColor || "w";
  const baseMs = preset.baseSeconds * 1000;

  return {
    kind: "practice-game-v1" as const,
    engineType: options.engineType,
    opponentElo: clampPracticeElo(options.opponentElo),
    playerColor,
    currentFen: PRACTICE_START_FEN,
    status: "active" as const,
    result: "*" as const,
    presetKey: preset.key,
    baseSeconds: preset.baseSeconds,
    incrementSeconds: options.incrementSeconds,
    clocksMs: {
      w: baseMs,
      b: baseMs,
    },
    activeColor: "w" as const,
    orientation: playerColor,
    moves: [],
    lastMoveUci: null,
    startedAt: now,
    updatedAt: now,
  };
}

export function isPracticeGameState(value: unknown): value is PracticeGameState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.kind === "practice-game-v1" &&
    typeof candidate.currentFen === "string" &&
    isPracticeEngineType(candidate.engineType) &&
    isPracticePresetKey(candidate.presetKey)
  );
}

export function normalizePracticeGameState(value: unknown): PracticeGameState | null {
  if (!isPracticeGameState(value)) return null;
  const candidate = value as PracticeGameState;
  const preset = getPracticePreset(candidate.presetKey);
  const engineType = isPracticeEngineType(candidate.engineType)
    ? candidate.engineType
    : "maia";
  const playerColor: PracticeColor = candidate.playerColor === "b" ? "b" : "w";
  const activeColor: PracticeColor = candidate.activeColor === "b" ? "b" : "w";
  const orientation: PracticeColor = candidate.orientation === "b" ? "b" : playerColor;
  const moves = Array.isArray(candidate.moves)
    ? candidate.moves.filter(
        (move): move is PracticeMoveRecord =>
          Boolean(
            move &&
              typeof move === "object" &&
              typeof move.uci === "string" &&
              typeof move.san === "string",
          ),
      )
    : [];
  const currentFen =
    typeof candidate.currentFen === "string" && candidate.currentFen.trim()
      ? candidate.currentFen.trim()
      : PRACTICE_START_FEN;

  let status: PracticeGameStatus = candidate.status;
  let result: PracticeGameState["result"] = candidate.result;
  try {
    const chess = new Chess(currentFen);
    if (chess.isCheckmate()) {
      status = "checkmate";
      result = chess.turn() === "w" ? "0-1" : "1-0";
    } else if (
      chess.isDraw() ||
      chess.isInsufficientMaterial() ||
      chess.isStalemate() ||
      chess.isThreefoldRepetition()
    ) {
      status = "draw";
      result = "1/2-1/2";
    }
  } catch {
    return null;
  }

  return {
    kind: "practice-game-v1",
    engineType,
    opponentElo: clampPracticeElo(candidate.opponentElo, 1500),
    playerColor,
    currentFen,
    status,
    result: result || "*",
    presetKey: preset.key,
    baseSeconds: Number.isFinite(candidate.baseSeconds)
      ? Math.max(30, Math.round(candidate.baseSeconds))
      : preset.baseSeconds,
    incrementSeconds: Number.isFinite(candidate.incrementSeconds)
      ? Math.max(0, Math.round(candidate.incrementSeconds))
      : preset.defaultIncrementSeconds,
    clocksMs: {
      w: Math.max(0, Math.round(Number(candidate.clocksMs?.w) || preset.baseSeconds * 1000)),
      b: Math.max(0, Math.round(Number(candidate.clocksMs?.b) || preset.baseSeconds * 1000)),
    },
    activeColor,
    orientation,
    moves,
    lastMoveUci:
      typeof candidate.lastMoveUci === "string" && candidate.lastMoveUci.trim()
        ? candidate.lastMoveUci.trim()
        : null,
    startedAt:
      typeof candidate.startedAt === "string" && candidate.startedAt
        ? candidate.startedAt
        : new Date().toISOString(),
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt
        ? candidate.updatedAt
        : new Date().toISOString(),
  };
}

export function practiceSummaryFromState(options: {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string;
  state: PracticeGameState;
}) {
  return {
    id: options.id,
    status: options.state.status,
    engineType: options.state.engineType,
    opponentElo: options.state.opponentElo,
    currentFen: options.state.currentFen,
    presetKey: options.state.presetKey,
    baseSeconds: options.state.baseSeconds,
    incrementSeconds: options.state.incrementSeconds,
    moveCount: options.state.moves.length,
    createdAt: options.createdAt,
    updatedAt: options.updatedAt,
    lastPlayedAt: options.lastPlayedAt,
  } satisfies PracticeGameSummary;
}

export function formatPracticeTimeControl(baseSeconds: number, incrementSeconds: number) {
  const minutes = Math.floor(baseSeconds / 60);
  return `${minutes}+${incrementSeconds}`;
}

export function engineDisplayName(engineType: PracticeEngineType) {
  return engineType === "maia" ? "Maia 2" : "Stockfish";
}

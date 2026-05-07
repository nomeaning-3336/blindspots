import { Chess } from "chess.js";

export type CorpusPhase = "opening" | "middlegame" | "endgame";

export type CorpusCandidateRow = {
  id: string;
  fen: string;
  previousFen: string;
  playedMove: string;
  phase: CorpusPhase;
  sourceType: "pgn" | "json" | "parquet" | "unknown";
  sourceGameId: string | null;
  sourcePly: number;
  sideToMove: "white" | "black";
  tags: string[];
  createdAt: string;
};

export type NormalizedDecisionKey = string;

/**
 * Normalize a FEN to a decision key for deduplication.
 * Only board placement, side to move, castling rights, and en passant
 * are included — halfmove and fullmove counters are excluded.
 */
export function normalizeFenKey(fen: string): NormalizedDecisionKey {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return "";
  return parts.slice(0, 4).join(" ");
}

/**
 * Classify a position as opening, middlegame, or endgame based on ply and material.
 */
export function classifyPhase(ply: number, fen: string): CorpusPhase {
  if (ply <= 20) return "opening";

  const pieceCount = countPieces(fen);
  const isEndgame = isEndgameMaterial(fen, pieceCount, ply);

  if (isEndgame) return "endgame";
  if (ply <= 70) return "middlegame";

  // Very deep game with reduced material leans endgame
  if (pieceCount <= 14) return "endgame";

  return "middlegame";
}

/**
 * Determine if a position has endgame-like material.
 */
export function isEndgameMaterial(
  fen: string,
  pieceCount?: number | null,
  ply?: number | null,
): boolean {
  const count = pieceCount ?? countPieces(fen);

  // Very few pieces = endgame
  if (count <= 10) return true;

  const board = fen.trim().split(/\s+/)[0] ?? "";

  const hasQueens = /[qQ]/.test(board);
  const nonPawnMaterial = board.replace(/[pP1-8/]/g, "").length;

  // No queens + low non-pawn material = endgame
  if (!hasQueens && nonPawnMaterial <= 6) return true;

  // Deep game with reduced material
  if ((ply ?? 0) > 70 && count <= 14) return true;

  return false;
}

/**
 * Count total pieces on the board from a FEN.
 */
export function countPieces(fen: string): number {
  const board = fen.trim().split(/\s+/)[0] ?? "";
  let count = 0;
  for (const ch of board) {
    if (/[pnbrqkPNBRQK]/.test(ch)) count++;
  }
  return count;
}

/**
 * Check if a position is terminal (checkmate, stalemate, draw, game over, no legal moves).
 */
export function isTerminalPosition(fen: string): boolean {
  try {
    const chess = new Chess(fen);
    if (chess.isGameOver()) return true;
    if (chess.moves().length === 0) return true;
    return false;
  } catch {
    return true; // invalid FEN = excluded
  }
}

/**
 * Check if a FEN string is syntactically valid.
 */
export function isValidFen(fen: string): boolean {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a candidate row from a replayed position.
 */
export function buildCandidateRow(params: {
  previousFen: string;
  playedMove: string;
  fen: string;
  phase: CorpusPhase;
  sourceType: "pgn" | "json" | "parquet" | "unknown";
  sourceGameId: string | null;
  sourcePly: number;
  tags?: string[];
}): CorpusCandidateRow {
  const sideToMove = params.fen.trim().split(/\s+/)[1] === "b" ? "black" : "white";

  return {
    id: `${params.sourceGameId ?? "game"}_${params.sourcePly}`,
    fen: params.fen,
    previousFen: params.previousFen,
    playedMove: params.playedMove,
    phase: params.phase,
    sourceType: params.sourceType,
    sourceGameId: params.sourceGameId,
    sourcePly: params.sourcePly,
    sideToMove,
    tags: params.tags ?? [],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Extract the side to move from a FEN string.
 */
export function sideToMoveFromFen(fen: string): "white" | "black" {
  const side = fen.trim().split(/\s+/)[1];
  return side === "b" ? "black" : "white";
}

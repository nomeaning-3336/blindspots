import { Chess } from "chess.js";
import type { TrainingBucket, TrainingPhase, TrainingQueueItem } from "./queue-core";

/**
 * Classify the training phase of a position based on FEN heuristics.
 * Opening: fullmove <= 12 or ply <= 24 with mostly intact material.
 * Tactic: item.isTactic is true or tags include tactical motifs.
 * Endgame: queens off and low non-pawn material, or total pieces <= 10.
 * Middlegame: everything else that is not terminal.
 * Unknown: FEN is invalid.
 */
export function classifyTrainingPhase(fen: string): TrainingPhase {
  try {
    const chess = new Chess(fen);
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 6) return "unknown";

    const board = parts[0];
    const fullmove = parseInt(parts[5], 10);
    const totalPieces = board.replace(/[^a-zA-Z]/g, "").length;
    const hasQueens = /[qQ]/.test(board);
    const nonPawnPieces = board.replace(/[^a-zA-Z]/g, "").replace(/[pP]/g, "").length;

    // Endgame: low piece count OR queenless with low material
    if (totalPieces <= 10) return "endgame";
    if (!hasQueens && nonPawnPieces <= 4) return "endgame";
    if (!hasQueens && totalPieces <= 10) return "endgame";

    // Opening: early game with substantial material
    if (fullmove <= 10 && totalPieces >= 24) {
      return "opening";
    }

    // Middlegame: everything else
    return "middlegame";
  } catch {
    return "unknown";
  }
}

/**
 * Classify the training bucket of a queue item based on its metadata or FEN.
 */
export function classifyTrainingBucket(
  item: Pick<TrainingQueueItem, "fen" | "tags" | "isTactic" | "phase" | "bucket">,
): TrainingBucket {
  // Explicit bucket from metadata
  if (item.bucket) return item.bucket;

  // Explicit tactic flag or tactical tags
  if (item.isTactic || (item.tags && item.tags.some((t) => t === "tactic" || t === "tactical"))) {
    return "tactic";
  }

  // Phase-based bucket fallback
  const phase = item.phase ?? classifyTrainingPhase(item.fen);

  switch (phase) {
    case "opening": {
      // Detect gambit vs development from tags or ECO
      if (item.tags?.some((t) => t === "gambit" || t === "opening_gambit")) return "opening_gambit";
      if (item.tags?.some((t) => t === "development" || t === "opening_development")) return "opening_development";
      return "opening";
    }
    case "endgame": {
      // Detect rook vs pawn endgames
      if (item.tags?.some((t) => t === "endgame_rook" || t === "rook_endgame")) return "endgame_rook";
      if (item.tags?.some((t) => t === "endgame_pawn" || t === "pawn_endgame")) return "endgame_pawn";
      return "endgame";
    }
    case "tactic":
      return "tactic";
    case "middlegame": {
      if (item.tags?.some((t) => t === "attack" || t === "middlegame_attack")) return "middlegame_attack";
      if (item.tags?.some((t) => t === "positional" || t === "middlegame_positional")) return "middlegame_positional";
      return "middlegame";
    }
    default:
      return "wildcard";
  }
}

/**
 * Enrich a TrainingQueueItem with phase and bucket if not already present.
 */
export function enrichTrainingQueueItem(item: TrainingQueueItem): TrainingQueueItem {
  if (item.phase && item.bucket) return item;

  const phase = item.phase ?? classifyTrainingPhase(item.fen);
  const bucket = item.bucket ?? classifyTrainingBucket({ fen: item.fen, tags: item.tags, isTactic: item.isTactic, phase, bucket: item.bucket });

  return { ...item, phase, bucket };
}

/**
 * Classify phase from a FEN piece board string (e.g. "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR").
 */
export function classifyBoardPhase(board: string): "opening" | "middlegame" | "endgame" {
  const hasQueens = /Q/.test(board);
  const nonPawnPieces = board.replace(/[^a-zA-Z]/g, "").replace(/[pP]/g, "").length;
  const totalPieces = board.replace(/[^a-zA-Z]/g, "").length;

  if (!hasQueens && nonPawnPieces <= 4) return "endgame";
  if (!hasQueens && totalPieces <= 10) return "endgame";
  if (totalPieces <= 8 && nonPawnPieces <= 4) return "endgame";
  return "middlegame";
}

/**
 * Count pieces from a FEN board string.
 */
export function countPieces(board: string): number {
  return board.replace(/[\/1-8]/g, "").length;
}

/**
 * Check if a FEN appears to be a gambit position (early material imbalance).
 */
export function isGambitFen(fen: string): boolean {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 1) return false;
  const board = parts[0];

  // Split into ranks to avoid cross-rank mixing
  const ranks = board.split("/");
  if (ranks.length !== 8) return false;

  let whitePawnCount = 0;
  let blackPawnCount = 0;
  let whiteNonPawn = 0;
  let blackNonPawn = 0;

  for (const rank of ranks) {
    let i = 0;
    while (i < rank.length) {
      const ch = rank[i]!;
      if (ch >= "a" && ch <= "z") {
        // Black pieces
        if (ch === "p") blackPawnCount += 1;
        else blackNonPawn += 1;
        i += 1;
      } else if (ch >= "A" && ch <= "Z") {
        // White pieces
        if (ch === "P") whitePawnCount += 1;
        else whiteNonPawn += 1;
        i += 1;
      } else if (ch >= "1" && ch <= "8") {
        i += Number(ch);
      } else {
        i += 1;
      }
    }
  }

  // Gambit: one side sacrificed a pawn early (has < 8 pawns) but still has all pieces
  if (whiteNonPawn === 8 && blackNonPawn === 8 && (whitePawnCount < 8 || blackPawnCount < 8)) {
    return true;
  }

  return false;
}

/**
 * Detect opening name from FEN or ECO tag.
 */
export function detectOpeningName(fen: string, eco?: string): string | undefined {
  if (eco) return eco;
  return undefined;
}

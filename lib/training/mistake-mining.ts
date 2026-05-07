/**
 * App-native mistake mining — pure helpers.
 *
 * These functions have no transitive local .ts imports so they can be
 * loaded via createRequire in Node test files.
 */

// ── Types ──────────────────────────────────────────────────────────

export type MineableMove = {
  /** Normalized decisionFen + "::" + uci */
  moveKey: string;
  decisionFen: string;
  uci: string;
  san: string;
  classification: string;
  cpLoss: number;
  evalBefore: number;
  evalAfter: number;
  mateBefore: number | null;
  mateAfter: number | null;
  /** FEN after the user played this move (resultFen) */
  fenAfterUserMove: string;
  /** Setup prelude to reach decisionFen (one ply before) */
  setupPreviousFen: string | null;
  setupPlayedMoveUci: string | null;
  setupPlayedMoveSan: string | null;
};

export type MineableMoveInput = {
  decisionFen: string;
  uci: string;
  san?: string;
  classification?: string;
  cpLoss?: number;
  evalBefore?: number;
  evalAfter?: number;
  mateBefore?: number | null;
  mateAfter?: number | null;
  fenAfterUserMove?: string;
  /** Explicit setup prelude fields — used by the caller when available
   *  (e.g. the initial served-position prelude for the first move). */
  previousDecisionFen?: string | null;
  previousMoveUci?: string | null;
  previousMoveSan?: string | null;
};

export type MistakeSeverity = "severe" | "medium" | "low";

export type MiningSummary = {
  mineableCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedMissingDecisionFen: number;
  skippedMissingUci: number;
  skippedNonFailed: number;
  missingPreludeCount: number;
};

// ── Inlined helpers (same logic as mistake-memory.ts) ───────────────

/**
 * Strip irrelevant FEN fields so positions are keyed by board state
 * plus castling / en-passant rights only.
 */
export function normalizeDecisionFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  return parts.slice(0, 4).join(" ");
}

const FAIL_CLASSIFICATIONS = new Set(["inaccuracy", "mistake", "blunder"]);

/**
 * Classifications considered "mistakes" worth mining.
 */
export function isFailedClassification(classification?: string): boolean {
  if (!classification) return false;
  return FAIL_CLASSIFICATIONS.has(classification);
}

// ── Build move key ─────────────────────────────────────────────────

/**
 * Build a stable move key: normalized(decisionFen) + "::" + uci.
 */
export function buildMinedMistakeKey(decisionFen: string, uci: string): string {
  return `${normalizeDecisionFen(decisionFen)}::${uci}`;
}

// ── Mineability ────────────────────────────────────────────────────

/**
 * A user move is mineable if it has a failed classification.
 */
export function isMineableUserMistake(classification?: string): boolean {
  return isFailedClassification(classification);
}

// ── Severity ───────────────────────────────────────────────────────

/**
 * Classify mistake severity based on classification and cpLoss.
 */
export function classifyMistakeSeverity(input: {
  classification?: string;
  cpLoss?: number;
  mateBefore?: number | null;
  mateAfter?: number | null;
}): MistakeSeverity {
  const cpLoss = typeof input.cpLoss === "number" ? input.cpLoss : 0;
  const cls = input.classification ?? "";

  // Blunder or extreme cpLoss → severe
  if (cls === "blunder" || cpLoss >= 300) return "severe";

  // Mate swing — any mate-distance change (including losing or gaining a forced mate) is severe
  const mateBefore = typeof input.mateBefore === "number" ? input.mateBefore : null;
  const mateAfter = typeof input.mateAfter === "number" ? input.mateAfter : null;
  if (mateBefore !== null && mateAfter !== null && mateBefore !== mateAfter) return "severe";
  if (mateBefore !== mateAfter) return "severe";

  // Mistake or moderate cpLoss → medium
  if (cls === "mistake" || cpLoss >= 150) return "medium";

  // Inaccuracy or low cpLoss — only if failed helper says mineable
  if (cls === "inaccuracy" || cpLoss >= 75) return "low";

  // Should not reach here (non-mineable moves are filtered first)
  return "low";
}

// ── Review scheduling ──────────────────────────────────────────────

/**
 * Schedule next review based on severity.
 * Active mistakes get short initial delays so the user can review soon.
 */
export function nextReviewAtForMinedMistake(
  severity: MistakeSeverity,
  now: Date = new Date(),
): Date {
  const ms = now.getTime();
  switch (severity) {
    case "severe":
      return new Date(ms + 5 * 60 * 1000);      // 5 minutes
    case "medium":
      return new Date(ms + 30 * 60 * 1000);     // 30 minutes
    case "low":
      return new Date(ms + 2 * 60 * 60 * 1000); // 2 hours
    default:
      return new Date(ms + 2 * 60 * 60 * 1000);
  }
}

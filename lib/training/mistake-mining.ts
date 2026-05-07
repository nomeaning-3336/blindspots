/**
 * App-native mistake mining — extract failed user moves from training
 * sequences and persist them into the Active Mistakes pool.
 */

import { normalizeDecisionFen, isFailedClassification } from "./mistake-memory";
import { normalizeSetupPrelude } from "./setup-prelude";
import { inferLegalMoveBetweenFens } from "./fen-transition";

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
  /** Previous move in the sequence timeline (to build setup prelude) */
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

// ── Build move key ─────────────────────────────────────────────────

/**
 * Build a stable move key: normalized(decisionFen) + "::" + uci.
 * Same format as buildMoveKey in mistake-memory.ts.
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

// ── Extraction ─────────────────────────────────────────────────────

/**
 * Extract mineable failed user moves from a training sequence evaluation.
 *
 * Each entry in positionEvaluations represents one user move, with
 * fenAfterUserMove recording the board state after that move.
 * The opponent's reply sits between fenAfterUserMove[i-1] and decisionFen[i].
 *
 * Setup preludes are captured for moves i > 0 where we can infer the
 * opponent's move between the previous fenAfterUserMove and current decisionFen.
 */
export function extractMineableMistakesFromSequence(
  positionEvaluations: MineableMoveInput[],
): MineableMove[] {
  const result: MineableMove[] = [];

  for (let i = 0; i < positionEvaluations.length; i++) {
    const evalRow = positionEvaluations[i];

    if (!evalRow || typeof evalRow !== "object") continue;

    const decisionFen = evalRow.decisionFen;
    const uci = evalRow.uci;

    if (!decisionFen) continue;
    if (!uci) continue;

    if (!isMineableUserMistake(evalRow.classification)) continue;

    const moveKey = buildMinedMistakeKey(decisionFen, uci);

    let setupPreviousFen: string | null = null;
    let setupPlayedMoveUci: string | null = null;
    let setupPlayedMoveSan: string | null = null;

    // For i > 0: the opponent played from fenAfterUserMove[i-1] to decisionFen[i].
    // Infer the opponent's move and validate the prelude.
    if (i > 0) {
      const prevRow = positionEvaluations[i - 1];
      if (prevRow?.fenAfterUserMove) {
        const inferred = inferLegalMoveBetweenFens({
          fromFen: prevRow.fenAfterUserMove,
          toFen: decisionFen,
        });
        if (inferred) {
          const prelude = normalizeSetupPrelude({
            fen: decisionFen,
            previousFen: prevRow.fenAfterUserMove,
            playedMove: inferred,
          });
          if (prelude) {
            setupPreviousFen = prevRow.fenAfterUserMove;
            setupPlayedMoveUci = inferred;
            setupPlayedMoveSan = null; // opponent move SAN not available from positionEvaluations
          }
        }
      }
    }

    result.push({
      moveKey,
      decisionFen,
      uci,
      san: evalRow.san ?? "",
      classification: evalRow.classification ?? "",
      cpLoss: typeof evalRow.cpLoss === "number" ? evalRow.cpLoss : 0,
      evalBefore: typeof evalRow.evalBefore === "number" ? evalRow.evalBefore : 0,
      evalAfter: typeof evalRow.evalAfter === "number" ? evalRow.evalAfter : 0,
      mateBefore: evalRow.mateBefore ?? null,
      mateAfter: evalRow.mateAfter ?? null,
      fenAfterUserMove: evalRow.fenAfterUserMove ?? "",
      setupPreviousFen,
      setupPlayedMoveUci,
      setupPlayedMoveSan,
    });
  }

  return result;
}


/**
 * Move Notes — app-native user-move annotation tracking.
 *
 * This module provides the data model and pure helpers for tracking notes
 * on user moves from training sequences. Notes are keyed by
 * `moveKey = normalizeDecisionFen(decisionFen) + "::" + uci` where
 * `decisionFen` is the FEN *before* the user played the move.
 *
 * In the future this may be persisted to Supabase.
 */

/**
 * AnnotatedMove represents a user move that may have a text note attached.
 * Keyed by moveKey (normalizedFen::uci) in the annotations map.
 */
export type AnnotatedMove = {
  moveKey: string;
  decisionFen: string;
  uci: string;
  san?: string;
  classification?: string;
  cpLoss?: number;
  evalBefore?: number | null;
  evalAfter?: number | null;
  mateBefore?: number | null;
  mateAfter?: number | null;
  attemptCount: number;
  firstAttemptedAt: string;
  lastAttemptedAt: string;
  noteText: string;
};

/**
 * Build a moveKey from a decision FEN and UCI.
 * The decision FEN is normalized so that identical board positions
 * produce the same key regardless of halfmove clock / fullmove number.
 */
export function buildMoveKey(decisionFen: string, uci: string): string {
  return `${normalizeDecisionFen(decisionFen)}::${uci}`;
}

/**
 * Strip irrelevant FEN fields (halfmove clock, fullmove number) so
 * positions are keyed by board state + castling/ep rights only.
 */
export function normalizeDecisionFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  return parts.slice(0, 4).join(" ");
}

/**
 * Classifications considered "mistakes" worth remembering.
 */
const FAIL_CLASSIFICATIONS = new Set([
  "inaccuracy",
  "mistake",
  "blunder",
]);

export function isFailedClassification(
  classification?: string,
): boolean {
  if (!classification) return false;
  return FAIL_CLASSIFICATIONS.has(classification);
}

/**
 * Build or update a flat annotations map from an array of session move inputs.
 * Includes ALL user moves (not just failed ones).
 * Non-destructive: existing entries are preserved and enriched.
 */
export function buildSessionAnnotations(
  inputs: SessionMoveInput[],
  existing: Record<string, AnnotatedMove> = {},
): Record<string, AnnotatedMove> {
  const result: Record<string, AnnotatedMove> = { ...existing };

  for (const input of inputs) {
    const moveKey = buildMoveKey(input.decisionFen, input.uci);
    const existingEntry = result[moveKey];
    const now = new Date().toISOString();

    if (existingEntry) {
      result[moveKey] = {
        ...existingEntry,
        san: input.san ?? existingEntry.san,
        classification: input.classification ?? existingEntry.classification,
        cpLoss: input.cpLoss ?? existingEntry.cpLoss,
        evalBefore:
          input.evalBefore !== undefined ? input.evalBefore : existingEntry.evalBefore,
        evalAfter:
          input.evalAfter !== undefined ? input.evalAfter : existingEntry.evalAfter,
        mateBefore:
          input.mateBefore !== undefined ? input.mateBefore : existingEntry.mateBefore,
        mateAfter:
          input.mateAfter !== undefined ? input.mateAfter : existingEntry.mateAfter,
        attemptCount: existingEntry.attemptCount + 1,
        lastAttemptedAt: now,
      };
    } else {
      result[moveKey] = {
        moveKey,
        decisionFen: normalizeDecisionFen(input.decisionFen),
        uci: input.uci,
        san: input.san,
        classification: input.classification,
        cpLoss: input.cpLoss,
        evalBefore: input.evalBefore ?? null,
        evalAfter: input.evalAfter ?? null,
        mateBefore: input.mateBefore ?? null,
        mateAfter: input.mateAfter ?? null,
        attemptCount: 1,
        firstAttemptedAt: now,
        lastAttemptedAt: now,
        noteText: "",
      };
    }
  }

  return result;
}

/**
 * Upsert a single annotated move into the annotations map.
 * Preserves existing noteText when the moveKey already exists.
 */
export function upsertAnnotatedMove(
  annotations: Record<string, AnnotatedMove>,
  fields: {
    moveKey: string;
    decisionFen: string;
    uci: string;
    san?: string;
    classification?: string;
    cpLoss?: number;
    evalBefore?: number | null;
    evalAfter?: number | null;
    mateBefore?: number | null;
    mateAfter?: number | null;
  },
): Record<string, AnnotatedMove> {
  const existing = annotations[fields.moveKey];
  const now = new Date().toISOString();

  const entry: AnnotatedMove = existing
    ? {
        ...existing,
        san: fields.san ?? existing.san,
        classification: fields.classification ?? existing.classification,
        cpLoss: fields.cpLoss ?? existing.cpLoss,
        evalBefore:
          fields.evalBefore !== undefined ? fields.evalBefore : existing.evalBefore,
        evalAfter:
          fields.evalAfter !== undefined ? fields.evalAfter : existing.evalAfter,
        mateBefore:
          fields.mateBefore !== undefined ? fields.mateBefore : existing.mateBefore,
        mateAfter:
          fields.mateAfter !== undefined ? fields.mateAfter : existing.mateAfter,
        attemptCount: existing.attemptCount + 1,
        lastAttemptedAt: now,
      }
    : {
        moveKey: fields.moveKey,
        decisionFen: normalizeDecisionFen(fields.decisionFen),
        uci: fields.uci,
        san: fields.san,
        classification: fields.classification,
        cpLoss: fields.cpLoss,
        evalBefore: fields.evalBefore ?? null,
        evalAfter: fields.evalAfter ?? null,
        mateBefore: fields.mateBefore ?? null,
        mateAfter: fields.mateAfter ?? null,
        attemptCount: 1,
        firstAttemptedAt: now,
        lastAttemptedAt: now,
        noteText: "",
      };

  return { ...annotations, [fields.moveKey]: entry };
}

/**
 * Update the note text for an annotated move.
 * Creates a new entry if one doesn't exist.
 */
export function updateNoteText(
  annotations: Record<string, AnnotatedMove>,
  moveKey: string,
  text: string,
): Record<string, AnnotatedMove> {
  const existing = annotations[moveKey];
  const now = new Date().toISOString();

  if (existing) {
    return {
      ...annotations,
      [moveKey]: { ...existing, noteText: text, lastAttemptedAt: now },
    };
  }

  // Create a minimal entry (should not normally happen since we pre-seed all moves)
  return {
    ...annotations,
    [moveKey]: {
      moveKey,
      decisionFen: moveKey.split("::")[0] ?? "",
      uci: moveKey.split("::")[1] ?? "",
      attemptCount: 1,
      firstAttemptedAt: now,
      lastAttemptedAt: now,
      noteText: text,
    },
  };
}

/**
 * Get all annotations for a given normalized decision FEN.
 * Useful for looking up notes when a mined mistake review loads.
 */
export function getAnnotationsForDecisionFen(
  annotations: Record<string, AnnotatedMove>,
  decisionFen: string,
): AnnotatedMove[] {
  const normFen = normalizeDecisionFen(decisionFen);
  const prefix = `${normFen}::`;
  return Object.values(annotations).filter((a) => a.moveKey.startsWith(prefix));
}

/**
 * Input shape for a session move that may contribute to move annotations.
 */
export type SessionMoveInput = {
  uci: string;
  san?: string;
  classification?: string;
  cpLoss?: number;
  evalBefore?: number | null;
  evalAfter?: number | null;
  mateBefore?: number | null;
  mateAfter?: number | null;
  /** The FEN *before* the user played this move — the decision position. */
  decisionFen: string;
};

/** @deprecated Legacy types kept for type-only compatibility during migration. */
export type MistakeMoveMemory = never;
export type PositionMistakeMemory = never;

/**
 * Mistake Memory — app-native self-mined mistake tracking.
 *
 * This module provides the data model and pure helpers for recording
 * failed moves, user notes, and board snapshots per decision position.
 *
 * Persistence is client-side only in this slice.
 * TODO: persist to user_mistakes JSON column in next slice.
 */

export type MistakeNoteBlock =
  | {
      type: "text";
      text: string;
      updatedAt: string;
    }
  | {
      type: "board-snapshot";
      fen: string;
      lastMove?: { from: string; to: string };
      orientation?: "white" | "black";
      createdAt: string;
      caption?: string;
    };

export type MistakeMoveMemory = {
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
  notes: MistakeNoteBlock[];
};

export type PositionMistakeMemory = {
  decisionFen: string;
  failedMoves: MistakeMoveMemory[];
  selectedFailedMoveUci?: string;
};

/**
 * Strip irrelevant FEN fields (halfmove clock, fullmove number) so
 * positions are keyed by board state + castling/ep rights only.
 */
export function normalizeDecisionFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  // Keep: piece placement, active color, castling, en passant
  return parts.slice(0, 4).join(" ");
}

/**
 * Create an empty PositionMistakeMemory for the given decision FEN.
 */
export function createEmptyPositionMemory(decisionFen: string): PositionMistakeMemory {
  return {
    decisionFen: normalizeDecisionFen(decisionFen),
    failedMoves: [],
  };
}

/**
 * Upsert a failed move entry within a PositionMistakeMemory.
 * If an entry for this UCI already exists, merge in the new data
 * and increment attemptCount. Otherwise push a new entry.
 */
export function upsertFailedMoveMemory(
  position: PositionMistakeMemory,
  fields: {
    uci: string;
    san?: string;
    classification?: string;
    cpLoss?: number;
    evalBefore?: number | null;
    evalAfter?: number | null;
    mateBefore?: number | null;
    mateAfter?: number | null;
  },
  now: string = new Date().toISOString(),
): PositionMistakeMemory {
  const existingIndex = position.failedMoves.findIndex(
    (m) => m.uci === fields.uci,
  );

  if (existingIndex >= 0) {
    const existing = position.failedMoves[existingIndex];
    const updated: MistakeMoveMemory = {
      ...existing,
      uci: fields.uci,
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
    };
    const newMoves = [...position.failedMoves];
    newMoves[existingIndex] = updated;
    return { ...position, failedMoves: newMoves };
  }

  const newMove: MistakeMoveMemory = {
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
    notes: [],
  };

  return {
    ...position,
    failedMoves: [...position.failedMoves, newMove],
  };
}

/**
 * Select a failed move by UCI. The selected move's notes area is shown.
 */
export function selectFailedMove(
  position: PositionMistakeMemory,
  uci: string,
): PositionMistakeMemory {
  const exists = position.failedMoves.some((m) => m.uci === uci);
  return {
    ...position,
    selectedFailedMoveUci: exists ? uci : undefined,
  };
}

/**
 * Update the text note block for a failed move.
 * Creates a text block if none exists; overwrites the text if one does.
 */
export function updateNoteBlock(
  position: PositionMistakeMemory,
  uci: string,
  text: string,
  now: string = new Date().toISOString(),
): PositionMistakeMemory {
  const moveIndex = position.failedMoves.findIndex((m) => m.uci === uci);
  if (moveIndex < 0) return position;

  const existing = position.failedMoves[moveIndex];
  const textBlockIndex = existing.notes.findIndex(
    (n) => n.type === "text",
  );
  let updatedNotes: MistakeNoteBlock[];

  if (textBlockIndex >= 0) {
    updatedNotes = existing.notes.map((n, i) =>
      i === textBlockIndex && n.type === "text"
        ? { ...n, text, updatedAt: now }
        : n,
    );
  } else {
    const newBlock: MistakeNoteBlock = {
      type: "text",
      text,
      updatedAt: now,
    };
    updatedNotes = [...existing.notes, newBlock];
  }

  const updatedMove = { ...existing, notes: updatedNotes };
  const newMoves = [...position.failedMoves];
  newMoves[moveIndex] = updatedMove;
  return { ...position, failedMoves: newMoves };
}

/**
 * Append a board-snapshot note block to a failed move.
 */
export function appendBoardSnapshot(
  position: PositionMistakeMemory,
  uci: string,
  snapshot: {
    fen: string;
    lastMove?: { from: string; to: string };
    orientation?: "white" | "black";
    caption?: string;
  },
  now: string = new Date().toISOString(),
): PositionMistakeMemory {
  const moveIndex = position.failedMoves.findIndex((m) => m.uci === uci);
  if (moveIndex < 0) return position;

  const existing = position.failedMoves[moveIndex];
  const snapshotBlock: MistakeNoteBlock = {
    type: "board-snapshot",
    fen: snapshot.fen,
    lastMove: snapshot.lastMove,
    orientation: snapshot.orientation,
    createdAt: now,
    caption: snapshot.caption,
  };

  const updatedMove = {
    ...existing,
    notes: [...existing.notes, snapshotBlock],
  };
  const newMoves = [...position.failedMoves];
  newMoves[moveIndex] = updatedMove;
  return { ...position, failedMoves: newMoves };
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
 * Input shape for a session move that may contribute to mistake memory.
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

/**
 * Build a map of normalized-decision-FEN → PositionMistakeMemory from an
 * array of session move inputs. Only includes moves classified as failures.
 * Non-destructive: existing entries are preserved.
 */
export function buildSessionMistakeMemories(
  inputs: SessionMoveInput[],
  existing: Record<string, PositionMistakeMemory> = {},
): Record<string, PositionMistakeMemory> {
  const result: Record<string, PositionMistakeMemory> = { ...existing };

  for (const input of inputs) {
    const classification = input.classification;
    if (!isFailedClassification(classification)) continue;

    const normFen = normalizeDecisionFen(input.decisionFen);
    const existingMem = result[normFen] ?? createEmptyPositionMemory(input.decisionFen);

    result[normFen] = upsertFailedMoveMemory(existingMem, {
      uci: input.uci,
      san: input.san,
      classification,
      cpLoss: input.cpLoss ?? undefined,
      evalBefore: input.evalBefore,
      evalAfter: input.evalAfter,
      mateBefore: input.mateBefore,
      mateAfter: input.mateAfter,
    });
  }

  return result;
}

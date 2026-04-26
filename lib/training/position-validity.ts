import { Chess } from "chess.js";

export type TrainingPositionValidity = {
  ok: boolean;
  reason?: string;
  terminal?: boolean;
  legalMoveCount?: number;
  mateDistancePlies?: number | null;
};

export type TrainingCandidateForValidity = {
  fen: string;
  previousFen?: string;
  playedMove?: string;
  mateDistancePlies?: number | null;
};

export function validatePlayableTrainingFen(
  fen: string,
  options: {
    sequenceLength?: number;
    mateDistancePlies?: number | null;
  } = {},
): TrainingPositionValidity {
  try {
    const chess = new Chess(fen);
    const legalMoves = chess.moves({ verbose: true });

    if (chess.isCheckmate()) {
      return {
        ok: false,
        reason: "checkmate",
        terminal: true,
        legalMoveCount: legalMoves.length,
      };
    }

    if (chess.isStalemate()) {
      return {
        ok: false,
        reason: "stalemate",
        terminal: true,
        legalMoveCount: legalMoves.length,
      };
    }

    if (chess.isDraw()) {
      return {
        ok: false,
        reason: "draw",
        terminal: true,
        legalMoveCount: legalMoves.length,
      };
    }

    if (chess.isGameOver()) {
      return {
        ok: false,
        reason: "game_over",
        terminal: true,
        legalMoveCount: legalMoves.length,
      };
    }

    if (legalMoves.length === 0) {
      return {
        ok: false,
        reason: "no_legal_moves",
        terminal: true,
        legalMoveCount: 0,
      };
    }

    const sequenceLength = normalizePositiveInteger(options.sequenceLength);
    const mateDistancePlies = normalizePositiveInteger(options.mateDistancePlies);
    if (
      sequenceLength !== null &&
      mateDistancePlies !== null &&
      mateDistancePlies < sequenceLength
    ) {
      return {
        ok: false,
        reason: "mate_in_less_than_sequence",
        terminal: false,
        legalMoveCount: legalMoves.length,
        mateDistancePlies,
      };
    }

    return {
      ok: true,
      legalMoveCount: legalMoves.length,
      mateDistancePlies: mateDistancePlies ?? null,
    };
  } catch {
    return { ok: false, reason: "invalid_fen" };
  }
}

export function validateSetupMoveResult(
  previousFen: string,
  playedMove: string,
  expectedFen: string,
  options: {
    sequenceLength?: number;
    mateDistancePlies?: number | null;
  } = {},
): TrainingPositionValidity {
  try {
    const chess = new Chess(previousFen);
    const played = applyMove(chess, playedMove);
    if (!played) return { ok: false, reason: "setup_illegal_move" };

    const actualFen = chess.fen();
    const actualKey = fenStateKey(actualFen);
    const expectedKey = fenStateKey(expectedFen);
    if (!actualKey || !expectedKey || actualKey !== expectedKey) {
      return { ok: false, reason: "setup_fen_mismatch" };
    }

    const validity = validatePlayableTrainingFen(actualFen, options);
    if (!validity.ok) {
      return {
        ...validity,
        reason: `setup_${validity.reason ?? "invalid"}`,
      };
    }
    return validity;
  } catch {
    return { ok: false, reason: "setup_invalid" };
  }
}

export function validateTrainingQueueItem(
  candidate: TrainingCandidateForValidity,
  options: { sequenceLength?: number } = {},
): TrainingPositionValidity {
  const fenValidity = validatePlayableTrainingFen(candidate.fen, {
    sequenceLength: options.sequenceLength,
    mateDistancePlies: candidate.mateDistancePlies,
  });
  if (!fenValidity.ok) return fenValidity;

  if (candidate.previousFen && candidate.playedMove) {
    const setupValidity = validateSetupMoveResult(
      candidate.previousFen,
      candidate.playedMove,
      candidate.fen,
      {
        sequenceLength: options.sequenceLength,
        mateDistancePlies: candidate.mateDistancePlies,
      },
    );
    if (!setupValidity.ok) return setupValidity;
  }

  return fenValidity;
}

function applyMove(chess: Chess, move: string) {
  const trimmed = move.trim();
  if (/^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/.test(trimmed)) {
    return chess.move({
      from: trimmed.slice(0, 2),
      to: trimmed.slice(2, 4),
      promotion: trimmed[4]?.toLowerCase(),
    });
  }
  return chess.move(trimmed);
}

function fenStateKey(fen: string) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return null;
  return parts.slice(0, 4).join(" ");
}

function normalizePositiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.floor(parsed);
  return normalized >= 0 ? normalized : null;
}
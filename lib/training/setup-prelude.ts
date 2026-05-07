import { Chess } from "chess.js";

export type SetupPreludeInput = {
  fen?: string | null;
  previousFen?: string | null;
  playedMove?: string | null;
};

export type SetupPrelude = {
  previousFen: string;
  playedMove: string;
};

export type SetupPreludeValidationResult =
  | {
      ok: true;
      fen: string;
      previousFen: string;
      playedMove: string;
      reachedFen: string;
      boardPlacementMatches: boolean;
      sideToMoveMatches: boolean;
      castlingRightsMatch: boolean;
      enPassantMatch: boolean;
    }
  | {
      ok: false;
      reason:
        | "missing_fen"
        | "missing_previous_fen"
        | "missing_played_move"
        | "invalid_previous_fen"
        | "illegal_played_move"
        | "fen_mismatch"
        | "stale_castling_rights"
        | "stale_en_passant";
      fen: string | null;
      previousFen: string | null;
      playedMove: string | null;
      reachedFen?: string;
      boardPlacementMatches?: boolean;
      sideToMoveMatches?: boolean;
      castlingRightsMatch?: boolean;
      enPassantMatch?: boolean;
    };

export function normalizeSetupPrelude(input: SetupPreludeInput): SetupPrelude | null {
  const validation = validateSetupPrelude(input);
  if (!validation.ok) return null;

  return {
    previousFen: validation.previousFen,
    playedMove: validation.playedMove,
  };
}

function normalizeNonEmptyString(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function validateSetupPrelude(input: SetupPreludeInput): SetupPreludeValidationResult {
  const fen = normalizeNonEmptyString(input.fen);
  const previousFen = normalizeNonEmptyString(input.previousFen);
  const playedMove = normalizeNonEmptyString(input.playedMove);

  if (!fen) {
    return { ok: false, reason: "missing_fen", fen, previousFen, playedMove };
  }
  if (!previousFen) {
    return { ok: false, reason: "missing_previous_fen", fen, previousFen, playedMove };
  }
  if (!playedMove) {
    return { ok: false, reason: "missing_played_move", fen, previousFen, playedMove };
  }

  const moveResult = applySetupMove(previousFen, playedMove);
  if (moveResult.status === "invalid_previous_fen") {
    return { ok: false, reason: "invalid_previous_fen", fen, previousFen, playedMove };
  }
  if (moveResult.status === "illegal_played_move") {
    return { ok: false, reason: "illegal_played_move", fen, previousFen, playedMove };
  }

  const comparison = compareFenFields(moveResult.reachedFen, fen);
  if (
    comparison.boardPlacementMatches &&
    comparison.sideToMoveMatches &&
    comparison.castlingRightsMatch &&
    comparison.enPassantMatch
  ) {
    return {
      ok: true,
      fen,
      previousFen,
      playedMove,
      reachedFen: moveResult.reachedFen,
      ...comparison,
    };
  }

  if (
    comparison.boardPlacementMatches &&
    comparison.sideToMoveMatches &&
    !comparison.castlingRightsMatch &&
    comparison.enPassantMatch
  ) {
    return {
      ok: false,
      reason: "stale_castling_rights",
      fen,
      previousFen,
      playedMove,
      reachedFen: moveResult.reachedFen,
      ...comparison,
    };
  }

  if (
    comparison.boardPlacementMatches &&
    comparison.sideToMoveMatches &&
    comparison.castlingRightsMatch &&
    !comparison.enPassantMatch
  ) {
    return {
      ok: false,
      reason: "stale_en_passant",
      fen,
      previousFen,
      playedMove,
      reachedFen: moveResult.reachedFen,
      ...comparison,
    };
  }

  return {
    ok: false,
    reason: "fen_mismatch",
    fen,
    previousFen,
    playedMove,
    reachedFen: moveResult.reachedFen,
    ...comparison,
  };
}

function applySetupMove(previousFen: string, playedMove: string):
  | { status: "invalid_previous_fen" }
  | { status: "illegal_played_move" }
  | { status: "ok"; reachedFen: string } {
  let chess: Chess;
  try {
    chess = new Chess(previousFen);
  } catch {
    return { status: "invalid_previous_fen" };
  }

  try {
    const move = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(playedMove)
      ? chess.move({
          from: playedMove.slice(0, 2),
          to: playedMove.slice(2, 4),
          promotion: playedMove[4],
        })
      : chess.move(playedMove);
    if (!move) return { status: "illegal_played_move" };
    return { status: "ok", reachedFen: chess.fen() };
  } catch {
    return { status: "illegal_played_move" };
  }
}

function compareFenFields(leftFen: string, rightFen: string) {
  const left = splitFenFields(leftFen);
  const right = splitFenFields(rightFen);
  return {
    boardPlacementMatches: left[0] === right[0],
    sideToMoveMatches: left[1] === right[1],
    castlingRightsMatch: left[2] === right[2],
    enPassantMatch: left[3] === right[3],
  };
}

function splitFenFields(fen: string) {
  const parts = fen.split(/\s+/);
  return [
    parts[0] ?? "",
    parts[1] ?? "",
    parts[2] ?? "",
    parts[3] ?? "",
  ] as const;
}

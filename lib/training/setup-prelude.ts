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

export function normalizeSetupPrelude(input: SetupPreludeInput): SetupPrelude | null {
  const fen = normalizeNonEmptyString(input.fen);
  const previousFen = normalizeNonEmptyString(input.previousFen);
  const playedMove = normalizeNonEmptyString(input.playedMove);
  if (!fen || !previousFen || !playedMove) return null;

  const reachedFen = applySetupMove(previousFen, playedMove);
  if (!reachedFen) return null;

  return samePosition(reachedFen, fen) ? { previousFen, playedMove } : null;
}

function normalizeNonEmptyString(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function applySetupMove(previousFen: string, playedMove: string) {
  try {
    const chess = new Chess(previousFen);
    const move = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(playedMove)
      ? chess.move({
          from: playedMove.slice(0, 2),
          to: playedMove.slice(2, 4),
          promotion: playedMove[4],
        })
      : chess.move(playedMove);
    return move ? chess.fen() : null;
  } catch {
    return null;
  }
}

function samePosition(leftFen: string, rightFen: string) {
  return leftFen.split(/\s+/).slice(0, 4).join(" ") === rightFen.split(/\s+/).slice(0, 4).join(" ");
}

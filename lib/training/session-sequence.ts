import { Chess } from "chess.js";

export type StoredTrainingMove = {
  san: string;
  uci: string;
  side: "w" | "b";
};

const MAX_PERSISTED_PLIES = 2048;

function normalizeUci(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();

  return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(normalized)
    ? normalized
    : null;
}

export function buildLegalStoredSequence(
  startingFen: string,
  rawMoveUcis: unknown,
): StoredTrainingMove[] | null {
  if (!Array.isArray(rawMoveUcis)) return null;
  if (rawMoveUcis.length === 0 || rawMoveUcis.length > MAX_PERSISTED_PLIES) return null;

  try {
    const chess = new Chess(startingFen);
    const storedMoves: StoredTrainingMove[] = [];

    for (const rawMoveUci of rawMoveUcis) {
      const uci = normalizeUci(rawMoveUci);
      if (!uci) return null;

      const side = chess.turn();
      const played = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length === 5 ? uci[4] : undefined,
      });

      if (!played) return null;

      storedMoves.push({
        san: played.san,
        uci: `${played.from}${played.to}${played.promotion ?? ""}`,
        side,
      });
    }

    return storedMoves;
  } catch {
    return null;
  }
}

export function countUserMovesInStoredSequence(
  startingFen: string,
  moves: StoredTrainingMove[],
): number {
  try {
    const userSide = new Chess(startingFen).turn();
    return moves.filter((move) => move.side === userSide).length;
  } catch {
    return 0;
  }
}

export function storedSequenceIsPrefix(
  existingMoves: StoredTrainingMove[],
  nextMoves: StoredTrainingMove[],
): boolean {
  if (nextMoves.length < existingMoves.length) return false;

  return existingMoves.every(
    (move, index) => nextMoves[index]?.uci === move.uci,
  );
}

import { Chess } from "chess.js";

const FILES = "abcdefgh";

function buildMoveVocabulary(): string[] {
  const moves: string[] = [];

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const from = `${FILES[file]}${rank + 1}`;

      for (let targetRank = 0; targetRank < 8; targetRank += 1) {
        for (let targetFile = 0; targetFile < 8; targetFile += 1) {
          moves.push(`${from}${FILES[targetFile]}${targetRank + 1}`);
        }
      }
    }
  }

  for (const fileFrom of FILES) {
    for (const fileTo of FILES) {
      for (const piece of ["q", "r", "b", "n"]) {
        moves.push(`${fileFrom}7${fileTo}8${piece}`);
      }
    }
  }

  return moves;
}

export const MAIA3_MOVE_VOCABULARY = buildMoveVocabulary();
export const MAIA3_MOVE_TO_INDEX = new Map(
  MAIA3_MOVE_VOCABULARY.map((move, index) => [move, index] as const),
);

function mirrorSquare(square: string): string {
  return `${square[0]}${9 - Number(square[1])}`;
}

export function mirrorMaiaMoveUci(uci: string): string {
  const promotion = uci.length > 4 ? uci.slice(4) : "";
  return `${mirrorSquare(uci.slice(0, 2))}${mirrorSquare(uci.slice(2, 4))}${promotion}`;
}

function legalMoveUci(move: { from: string; to: string; promotion?: string }) {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export function getLegalMaiaMoveIndices(chess: Chess): number[] {
  const blackToMove = chess.turn() === "b";

  return chess
    .moves({ verbose: true })
    .flatMap((move) => {
      const uci = legalMoveUci(move);
      const maiaUci = blackToMove ? mirrorMaiaMoveUci(uci) : uci;
      const index = MAIA3_MOVE_TO_INDEX.get(maiaUci);
      return index === undefined ? [] : [index];
    })
    .sort((left, right) => left - right);
}

export function decodeMaiaMoveIndex(index: number, chess: Chess): string | null {
  const maiaUci = MAIA3_MOVE_VOCABULARY[index];

  if (!maiaUci) {
    return null;
  }

  const uci = chess.turn() === "b" ? mirrorMaiaMoveUci(maiaUci) : maiaUci;

  try {
    const probe = new Chess(chess.fen());
    const played = probe.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4] : undefined,
    });

    return played ? `${played.from}${played.to}${played.promotion ?? ""}` : null;
  } catch {
    return null;
  }
}

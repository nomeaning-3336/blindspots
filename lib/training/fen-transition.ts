import { Chess } from "chess.js";

function comparableFen(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

export function inferLegalMoveBetweenFens(input: {
  fromFen: string;
  toFen: string;
}): string | null {
  try {
    const chess = new Chess(input.fromFen);
    const target = comparableFen(input.toFen);

    for (const move of chess.moves({ verbose: true })) {
      try {
        const clone = new Chess(input.fromFen);
        clone.move({ from: move.from, to: move.to, promotion: move.promotion });
        if (comparableFen(clone.fen()) === target) {
          return `${move.from}${move.to}${move.promotion ?? ""}`;
        }
      } catch {
        // try next move
      }
    }
  } catch {
    // invalid FEN
  }

  return null;
}

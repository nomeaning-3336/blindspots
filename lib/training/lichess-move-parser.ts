import { Chess } from "chess.js";

export type ParsedGameMove = {
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
  ply: number;
};

const UCI_MOVE_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export function parseLichessMoveText(movesText: string): ParsedGameMove[] {
  const tokens = movesText.trim().split(/\s+/).filter(Boolean);
  const chess = new Chess();
  const parsed: ParsedGameMove[] = [];

  for (const token of tokens) {
    const fenBefore = chess.fen();

    let played;
    try {
      if (UCI_MOVE_RE.test(token)) {
        played = chess.move({
          from: token.slice(0, 2),
          to: token.slice(2, 4),
          promotion: token[4] as never,
        });
      } else {
        played = chess.move(token);
      }
    } catch {
      break;
    }

    if (!played) break;

    parsed.push({
      uci: `${played.from}${played.to}${played.promotion ?? ""}`,
      san: played.san,
      fenBefore,
      fenAfter: chess.fen(),
      ply: parsed.length,
    });
  }

  return parsed;
}

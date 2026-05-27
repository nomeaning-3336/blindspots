import { Chess } from "chess.js";
import {
  MAIA3_HISTORY_LENGTH,
  MAIA3_TOKEN_DIMENSION,
  MAIA3_TOKEN_PLANES_PER_POSITION,
} from "./maia3-constants.ts";

type BuildMaiaHistoryTokensInput = {
  startingFen: string;
  moveUcis: string[];
};

const PIECE_CHANNELS: Record<string, number> = {
  p: 0,
  n: 1,
  b: 2,
  r: 3,
  q: 4,
  k: 5,
};

function tokenizeBoard(chess: Chess): Float32Array {
  const tokens = new Float32Array(64 * MAIA3_TOKEN_PLANES_PER_POSITION);
  const blackToMove = chess.turn() === "b";
  const board = chess.board();

  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const piece = board[rankIndex]?.[fileIndex];

      if (!piece) continue;

      const pythonRank = 7 - rankIndex;
      const pythonSquare = pythonRank * 8 + fileIndex;
      const square = blackToMove ? (7 - pythonRank) * 8 + fileIndex : pythonSquare;
      const color = blackToMove ? (piece.color === "w" ? "b" : "w") : piece.color;
      const baseChannel = PIECE_CHANNELS[piece.type];

      if (baseChannel === undefined) continue;

      const channel = baseChannel + (color === "b" ? 6 : 0);
      tokens[square * MAIA3_TOKEN_PLANES_PER_POSITION + channel] = 1;
    }
  }

  return tokens;
}

function playUci(chess: Chess, uci: string): void {
  const played = chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length === 5 ? uci[4] : undefined,
  });

  if (!played) {
    throw new Error(`Maia history contains an illegal move: ${uci}`);
  }
}

export function buildMaiaHistoryTokens({
  startingFen,
  moveUcis,
}: BuildMaiaHistoryTokensInput): Float32Array {
  const chess = new Chess(startingFen);
  const states: Float32Array[] = [tokenizeBoard(chess)];

  for (const uci of moveUcis) {
    playUci(chess, uci);
    states.push(tokenizeBoard(chess));
  }

  const window = states.slice(-MAIA3_HISTORY_LENGTH);
  const earliest = window[0]!;

  while (window.length < MAIA3_HISTORY_LENGTH) {
    window.unshift(earliest);
  }

  const tokens = new Float32Array(64 * MAIA3_TOKEN_DIMENSION);

  for (let square = 0; square < 64; square += 1) {
    for (let historyIndex = 0; historyIndex < MAIA3_HISTORY_LENGTH; historyIndex += 1) {
      const state = window[historyIndex]!;

      for (let channel = 0; channel < MAIA3_TOKEN_PLANES_PER_POSITION; channel += 1) {
        tokens[
          square * MAIA3_TOKEN_DIMENSION +
            historyIndex * MAIA3_TOKEN_PLANES_PER_POSITION +
            channel
        ] = state[square * MAIA3_TOKEN_PLANES_PER_POSITION + channel]!;
      }
    }
  }

  return tokens;
}

export function buildMaiaInputShape(): readonly [1, 64, 97] {
  return [1, 64, MAIA3_TOKEN_DIMENSION] as const;
}

import { Chess } from "chess.js";
import type { Square } from "chess.js";
import type { ClientEngineLine } from "./types";

type PromotionPiece = "q" | "r" | "b" | "n";

export type TrainingEngineLineResult = {
  cp: number;
  mate?: number | null;
  depth: number;
  rank: number;
  bestMove: string;
  bestSan: string;
  pv: string[];
  pvSan: string[];
  continuationSan?: string[];
  source?: "multipv" | "candidate";
};

export function clientLinesToTrainingEngineLines({
  fen,
  lines,
}: {
  fen: string;
  lines: ClientEngineLine[];
}): TrainingEngineLineResult[] {
  const isBlackToMove = fen.split(/\s+/)[1] === "b";

  return lines
    .flatMap((line) => {
      const converted = clientLineToTrainingEngineLine(fen, line, isBlackToMove);
      return converted ? [converted] : [];
    })
    .sort((left, right) => compareTrainingLinesForSideToMove(left, right, isBlackToMove))
    .map((line, index) => ({
      ...line,
      rank: index + 1,
    }));
}

function clientLineToTrainingEngineLine(
  fen: string,
  line: ClientEngineLine,
  isBlackToMove: boolean,
): TrainingEngineLineResult | null {
  if (line.pv.length === 0) return null;

  const chess = safeChess(fen);
  if (!chess) return null;

  const pvSan: string[] = [];
  const legalPv: string[] = [];

  for (const uciMove of line.pv) {
    const move = tryMove(chess, uciMove);
    if (!move) return null;

    legalPv.push(uciMove);
    pvSan.push(move.san);
  }

  const bestMove = legalPv[0];
  const bestSan = pvSan[0];
  if (!bestMove || !bestSan) return null;

  const rawCp = line.cp ?? mateScoreToCp(line.mate);
  const rawMate = line.mate;

  return {
    cp: isBlackToMove ? -rawCp : rawCp,
    mate: typeof rawMate === "number" ? (isBlackToMove ? -rawMate : rawMate) : rawMate,
    depth: line.depth,
    rank: line.rank,
    bestMove,
    bestSan,
    pv: legalPv,
    pvSan,
    continuationSan: pvSan.slice(1),
    source: "multipv",
  };
}

function safeChess(fen: string) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

function uciMoveToMoveInput(uciMove: string) {
  const from = uciMove.slice(0, 2) as Square;
  const to = uciMove.slice(2, 4) as Square;
  const promotion = normalizePromotion(uciMove.slice(4, 5));

  return promotion ? { from, to, promotion } : { from, to };
}

function tryMove(chess: Chess, uciMove: string) {
  try {
    return chess.move(uciMoveToMoveInput(uciMove));
  } catch {
    return null;
  }
}

function normalizePromotion(value: string): PromotionPiece | undefined {
  if (value === "q" || value === "r" || value === "b" || value === "n") {
    return value;
  }
  return undefined;
}

function mateScoreToCp(mate: number | null) {
  if (mate == null) return 0;
  return mate > 0 ? 100000 : -100000;
}

function compareTrainingLinesForSideToMove(
  left: TrainingEngineLineResult,
  right: TrainingEngineLineResult,
  isBlackToMove: boolean,
) {
  const leftScore = sideToMoveScore(left, isBlackToMove);
  const rightScore = sideToMoveScore(right, isBlackToMove);
  if (leftScore !== rightScore) return rightScore - leftScore;

  return right.depth - left.depth;
}

function sideToMoveScore(line: TrainingEngineLineResult, isBlackToMove: boolean) {
  if (typeof line.mate === "number") {
    const mateCp = mateScoreToCp(line.mate);
    return isBlackToMove ? -mateCp : mateCp;
  }

  return isBlackToMove ? -line.cp : line.cp;
}

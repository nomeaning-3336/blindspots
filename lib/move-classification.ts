export type MoveClassification =
  | "brilliant"
  | "critical"
  | "best"
  | "excellent"
  | "good"
  | "okay"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export type MoveEvaluationLine = {
  cp: number;
  mate?: number | null;
  bestMove?: string;
};

const CP_CEILING = 1000;
const WIN_CHANCE_BLUNDER_LOSS = 20;
const WIN_CHANCE_MISTAKE_LOSS = 10;
const WIN_CHANCE_DUBIOUS_LOSS = 5;
const WIN_CHANCE_FORCED_BEST_GAP = 10;
const WIN_CHANCE_GOOD_GAIN = 5;
const INTERESTING_SACRIFICE_MIN_CP = -200;

export function classifyMoveAgainstBest(
  bestLine: MoveEvaluationLine | null | undefined,
  candidateLine: MoveEvaluationLine | null | undefined,
  fen: string,
): MoveClassification | undefined {
  if (!bestLine || !candidateLine) return undefined;

  return classifyEvaluatedMove({
    previous: bestLine,
    next: candidateLine,
    color: sideToMove(fen),
    prevMoves: [bestLine],
    move: candidateLine.bestMove,
  });
}

export function classifyRankedMove(
  index: number,
  lines: MoveEvaluationLine[],
  fen: string,
): MoveClassification | undefined {
  const bestLine = lines[0];
  const candidateLine = lines[index];
  if (!bestLine || !candidateLine) return undefined;
  if (index === 0) {
    return hasForcedBestMoveGap(lines, sideToMove(fen)) ? "critical" : "best";
  }

  return classifyMoveAgainstBest(bestLine, candidateLine, fen);
}

export function classifyEvaluatedMove({
  previous,
  next,
  color,
  prevprev,
  prevMoves = [],
  isSacrifice = false,
  move,
}: {
  previous: MoveEvaluationLine | null | undefined;
  next: MoveEvaluationLine | null | undefined;
  color: "w" | "b";
  prevprev?: MoveEvaluationLine | null;
  prevMoves?: MoveEvaluationLine[];
  isSacrifice?: boolean;
  move?: string;
}): MoveClassification | undefined {
  if (!next) return undefined;

  return getAnnotation({
    previous,
    next,
    color,
    prevprev,
    prevMoves,
    isSacrifice,
    move,
  });
}

export function isRecommendableClassification(classification: MoveClassification | undefined) {
  return classification !== "inaccuracy" && classification !== "mistake" && classification !== "blunder";
}

function getAnnotation({
  prevprev,
  previous,
  next,
  color,
  prevMoves,
  isSacrifice,
  move,
}: {
  prevprev?: MoveEvaluationLine | null;
  previous: MoveEvaluationLine | null | undefined;
  next: MoveEvaluationLine;
  color: "w" | "b";
  prevMoves: MoveEvaluationLine[];
  isSacrifice?: boolean;
  move?: string;
}): MoveClassification | undefined {
  const { prevCP, nextCP } = normalizeScores(previous ?? { cp: 0 }, next, color);
  const winChanceDiff = getWinChance(prevCP) - getWinChance(nextCP);

  if (winChanceDiff > WIN_CHANCE_BLUNDER_LOSS) return "blunder";
  if (winChanceDiff > WIN_CHANCE_MISTAKE_LOSS) return "mistake";
  if (winChanceDiff > WIN_CHANCE_DUBIOUS_LOSS) return "inaccuracy";

  if (prevMoves.length > 1) {
    const bestGap = normalizeScores(prevMoves[0]!, prevMoves[1]!, color);
    const playedBestMove = Boolean(move && prevMoves[0]?.bestMove && move === prevMoves[0].bestMove);

    if (
      getWinChance(bestGap.prevCP) - getWinChance(bestGap.nextCP) >
        WIN_CHANCE_FORCED_BEST_GAP &&
      playedBestMove
    ) {
      const gain = normalizeScores(prevprev ?? { cp: 0 }, prevMoves[0]!, color);
      if (isSacrifice) return "brilliant";
      if (getWinChance(gain.nextCP) - getWinChance(gain.prevCP) > WIN_CHANCE_GOOD_GAIN) {
        return "good";
      }
      return "best";
    }

    if (isSacrifice && nextCP > INTERESTING_SACRIFICE_MIN_CP) {
      return "excellent";
    }
  }

  return "okay";
}

function hasForcedBestMoveGap(lines: MoveEvaluationLine[], color: "w" | "b") {
  if (lines.length < 2 || !lines[0]?.bestMove) return false;
  const { prevCP, nextCP } = normalizeScores(lines[0]!, lines[1]!, color);
  return getWinChance(prevCP) - getWinChance(nextCP) > WIN_CHANCE_FORCED_BEST_GAP;
}

function normalizeScores(
  previous: MoveEvaluationLine,
  next: MoveEvaluationLine,
  color: "w" | "b",
): { prevCP: number; nextCP: number } {
  return {
    prevCP: normalizeScore(previous, color),
    nextCP: normalizeScore(next, color),
  };
}

function normalizeScore(line: MoveEvaluationLine, color: "w" | "b"): number {
  let cp = Number(line.cp) || 0;
  if (color === "b") cp *= -1;
  if (Number.isFinite(line.mate)) {
    cp = CP_CEILING * Math.sign(Number(line.mate));
  }
  return clamp(cp, -CP_CEILING, CP_CEILING);
}

function getWinChance(centipawns: number) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * centipawns)) - 1);
}

function sideToMove(fen: string): "w" | "b" {
  return fen.split(/\s+/)[1] === "b" ? "b" : "w";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

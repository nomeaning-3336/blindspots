export type MoveClassification = "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";

export type MoveEvaluationLine = {
  cp: number;
  bestMove?: string;
};

export function classifyMoveAgainstBest(
  bestLine: MoveEvaluationLine | null | undefined,
  candidateLine: MoveEvaluationLine | null | undefined,
  fen: string,
): MoveClassification | undefined {
  if (!bestLine || !candidateLine) return undefined;
  if (candidateLine.bestMove && bestLine.bestMove && candidateLine.bestMove === bestLine.bestMove) {
    return "best";
  }

  const scoreLoss = expectedScoreLoss(bestLine, candidateLine, fen);
  const cpLoss = centipawnLoss(bestLine, candidateLine, fen);
  const byExpected = classifyExpectedScoreLoss(scoreLoss);
  const byCp = classifyCentipawnLoss(cpLoss);
  return worseClassification(byExpected, byCp);
}

export function classifyRankedMove(
  index: number,
  lines: MoveEvaluationLine[],
  fen: string,
): MoveClassification | undefined {
  const bestLine = lines[0];
  const candidateLine = lines[index];
  if (!bestLine || !candidateLine) return undefined;
  if (index === 0) return "best";
  return classifyMoveAgainstBest(bestLine, candidateLine, fen);
}

export function isRecommendableClassification(classification: MoveClassification | undefined) {
  return classification !== "inaccuracy" && classification !== "mistake" && classification !== "blunder";
}

function classifyExpectedScoreLoss(scoreLoss: number): MoveClassification {
  if (scoreLoss <= 0.018) return "excellent";
  if (scoreLoss <= 0.075) return "good";
  if (scoreLoss <= 0.16) return "inaccuracy";
  if (scoreLoss <= 0.27) return "mistake";
  return "blunder";
}

function classifyCentipawnLoss(cpLoss: number): MoveClassification {
  if (cpLoss <= 30) return "excellent";
  if (cpLoss <= 90) return "good";
  if (cpLoss <= 180) return "inaccuracy";
  if (cpLoss <= 320) return "mistake";
  return "blunder";
}

function worseClassification(left: MoveClassification, right: MoveClassification): MoveClassification {
  return classificationSeverity(left) >= classificationSeverity(right) ? left : right;
}

function classificationSeverity(classification: MoveClassification) {
  switch (classification) {
    case "best":
      return 0;
    case "excellent":
      return 1;
    case "good":
      return 2;
    case "inaccuracy":
      return 3;
    case "mistake":
      return 4;
    case "blunder":
      return 5;
  }
}

function expectedScoreLoss(bestLine: MoveEvaluationLine, candidateLine: MoveEvaluationLine, fen: string) {
  return Math.max(
    0,
    expectedScoreFromEval(comparableEval(bestLine, fen)) -
      expectedScoreFromEval(comparableEval(candidateLine, fen)),
  );
}

function centipawnLoss(bestLine: MoveEvaluationLine, candidateLine: MoveEvaluationLine, fen: string) {
  return Math.max(0, comparableEval(bestLine, fen) - comparableEval(candidateLine, fen));
}

function comparableEval(line: MoveEvaluationLine, fen: string) {
  const cp = Math.max(-100000, Math.min(100000, Number(line.cp) || 0));
  return sideToMove(fen) === "b" ? -cp : cp;
}

function expectedScoreFromEval(evalCp: number) {
  const cp = Math.max(-2000, Math.min(2000, Number(evalCp) || 0));
  return 1 / (1 + Math.exp(-cp / 180));
}

function sideToMove(fen: string) {
  return fen.split(/\s+/)[1] === "b" ? "b" : "w";
}

export type MoveClassification =
  | "critical"
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export type MoveEvaluationLine = {
  cp: number;
  mate?: number | null;
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
  if (index === 0) return looksCritical(bestLine, lines, fen) ? "critical" : "best";
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
    case "critical":
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

function looksCritical(bestLine: MoveEvaluationLine, lines: MoveEvaluationLine[], fen: string) {
  if (!bestLine.bestMove || lines.length < 2) return false;

  const danger = moveDangerProfile(lines, fen);
  if (danger.recommendableAlternatives > 0) return false;
  if (danger.bestEscapesMate) return true;
  if (
    danger.bestMateDistance != null &&
    danger.shortestAlternativeMate != null &&
    danger.shortestAlternativeMate < danger.bestMateDistance
  ) {
    return true;
  }

  return (
    danger.seriousMistakes + danger.blunders > 0 &&
    danger.nearBestCount <= 1 &&
    (danger.secondLoss >= 0.085 || danger.seriousMistakes >= 2)
  );
}

function moveDangerProfile(lines: MoveEvaluationLine[], fen: string) {
  const bestLine = lines[0];
  if (!bestLine || lines.length < 2) {
    return {
      recommendableAlternatives: 0,
      nearBestCount: bestLine ? 1 : 0,
      seriousMistakes: 0,
      blunders: 0,
      secondLoss: 0,
      bestEscapesMate: false,
      bestMateDistance: null,
      shortestAlternativeMate: null,
    };
  }

  const alternatives = lines.slice(1);
  const alternativeClasses = alternatives.map((candidate) => classifyMoveAgainstBest(bestLine, candidate, fen));
  const losses = alternatives.map((candidate) => expectedScoreLoss(bestLine, candidate, fen));
  const losingMateAlternatives = alternatives
    .filter((candidate) => Number.isFinite(candidate.mate) && Number(candidate.mate) < 0)
    .map((candidate) => Math.abs(Number(candidate.mate)));
  const bestMateDistance =
    Number.isFinite(bestLine.mate) && Number(bestLine.mate) < 0 ? Math.abs(Number(bestLine.mate)) : null;

  return {
    recommendableAlternatives: alternativeClasses.filter((moveClass) =>
      isRecommendableClassification(moveClass),
    ).length,
    nearBestCount: 1 + losses.filter((loss) => loss <= 0.018).length,
    seriousMistakes: losses.filter((loss) => loss >= 0.13).length,
    blunders: losses.filter((loss) => loss >= 0.27).length,
    secondLoss: losses[0] || 0,
    bestEscapesMate: bestMateDistance == null && losingMateAlternatives.length > 0,
    bestMateDistance,
    shortestAlternativeMate: losingMateAlternatives.length ? Math.min(...losingMateAlternatives) : null,
  };
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

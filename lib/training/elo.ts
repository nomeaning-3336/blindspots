export type SkillLevel = "new_to_chess" | "beginner" | "intermediate" | "advanced" | "expert";

export const DEFAULT_RATING_DEVIATION = 650;
export const MIN_RATING_DEVIATION = 80;
export const MAX_RATING_DEVIATION = 700;
const MATCHED_ENGINE_MAX_DELTA = 64;
const MATCHED_ENGINE_CPL_SCALE = 120;
const MIN_MATCHED_ENGINE_ELO = 100;
const MIN_CPL_MOVES_PER_SIDE = 4;
const MAX_RATING_CPL = 1000;

export function getStartingEloForSkillLevel(skillLevel: SkillLevel) {
  switch (skillLevel) {
    case "new_to_chess":
      return 0;
    case "beginner":
      return 500;
    case "intermediate":
      return 1000;
    case "advanced":
      return 1500;
    case "expert":
      return 2000;
  }
}

export function normalizeSkillLevel(value: unknown): SkillLevel {
  if (
    value === "new_to_chess" ||
    value === "beginner" ||
    value === "intermediate" ||
    value === "advanced" ||
    value === "expert"
  ) {
    return value;
  }

  return "beginner";
}

export function normalizeRatingDeviation(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RATING_DEVIATION;
  return Math.max(MIN_RATING_DEVIATION, Math.min(MAX_RATING_DEVIATION, parsed));
}

export interface EloUpdateInput {
  currentElo: number;
  ratingDeviation?: number;
  totalSequences: number;
  evalPreservationScore: number | null;
  totalCpLoss?: number;
  opponentElo?: number;
  averageCpDelta?: number | null;
  worstCpDelta?: number | null;
}

export interface EloUpdateResult {
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
  kFactor: number;
  opponentElo: number;
  expectedScore: number;
  actualScore: number;
  rawDelta: number;
  clampedDelta: number;
  ratingDeviationBefore: number;
  ratingDeviationAfter: number;
  humanAvgCpl?: number | null;
  engineAvgCpl?: number | null;
  cplDiff?: number | null;
  ratingMethod?: "legacy" | "matched_engine_cpl";
}

export type CplAnalyzedMove = {
  sideToMove: "w" | "b";
  bestEvalCp: number;
  playedEvalCp: number;
};

export function getSeededStartingElo(totalCpLoss: number, totalMoves: number) {
  if (totalMoves <= 0) return 1200;
  const avgCpLoss = totalCpLoss / totalMoves;
  const seededElo = Math.round(2200 - avgCpLoss * 8);
  return clampInteger(seededElo, 600, 1800);
}

export function getKFactor(totalSequences: number, ratingDeviation = DEFAULT_RATING_DEVIATION) {
  const rd = normalizeRatingDeviation(ratingDeviation);

  if (totalSequences <= 3) return Math.round(Math.min(480, Math.max(260, rd * 0.65)));
  if (totalSequences <= 8) return Math.round(Math.min(300, Math.max(160, rd * 0.45)));
  if (totalSequences <= 20) return Math.round(Math.min(160, Math.max(70, rd * 0.28)));

  return Math.round(Math.min(48, Math.max(20, rd * 0.25)));
}

export function getOpponentElo(userElo: number) {
  const normalizedUserElo = Number.isFinite(userElo)
    ? Math.max(MIN_MATCHED_ENGINE_ELO, Math.round(userElo))
    : 500;

  return normalizedUserElo;
}

export function getNextRatingDeviation(current: number, totalSequences: number) {
  const rd = normalizeRatingDeviation(current);

  const decay =
    totalSequences <= 3 ? 0.82 :
    totalSequences <= 8 ? 0.86 :
    totalSequences <= 20 ? 0.9 :
    0.96;

  return Math.round(Math.max(MIN_RATING_DEVIATION, rd * decay));
}

export function calculateExpectedScore(userElo: number, opponentElo: number) {
  return 1 / (1 + Math.pow(10, (opponentElo - userElo) / 400));
}

function getEloDeltaClamp(totalSequences: number, scoreDelta: number, isOutlier: boolean) {
  const OUTLIER_MULTIPLIER = 2.4;

  let range: { min: number; max: number };

  if (totalSequences <= 3) {
    range = scoreDelta >= 0
      ? { min: -220, max: 320 }
      : { min: -220, max: 180 };
  } else if (totalSequences <= 8) {
    range = { min: -160, max: 180 };
  } else if (totalSequences <= 20) {
    range = { min: -90, max: 90 };
  } else {
    range = { min: -35, max: 35 };
  }

  if (isOutlier) {
    range = {
      min: Math.round(range.min * OUTLIER_MULTIPLIER),
      max: Math.round(range.max * OUTLIER_MULTIPLIER),
    };
  }

  return range;
}

export function calculateEloUpdate(input: EloUpdateInput): EloUpdateResult | null {
  if (input.evalPreservationScore === null) return null;

  const eloBefore = Math.max(0, Math.round(input.currentElo));
  const ratingDeviationBefore = normalizeRatingDeviation(input.ratingDeviation);
  const kFactor = getKFactor(input.totalSequences, ratingDeviationBefore);
  const opponentElo = Number.isFinite(input.opponentElo)
    ? Math.max(0, Math.round(input.opponentElo!))
    : getOpponentElo(eloBefore);
  const expectedScore = calculateExpectedScore(eloBefore, opponentElo);

  let actualScore: number;
  if (typeof input.averageCpDelta === "number" && typeof input.worstCpDelta === "number") {
    const averageScoreComponent = 1 - input.averageCpDelta / 100;
    const worstMoveComponent = 1 - input.worstCpDelta / 350;
    actualScore = clamp(0.75 * averageScoreComponent + 0.25 * worstMoveComponent, -0.75, 1.35);
  } else {
    actualScore = clamp(input.evalPreservationScore, 0, 1);
  }

  const scoreDelta = actualScore - expectedScore;
  const rawDelta = Math.round(kFactor * scoreDelta);

  const isOutlier = actualScore < -0.25 || actualScore > 1.15;
  const clampRange = getEloDeltaClamp(input.totalSequences, scoreDelta, isOutlier);
  const clampedDelta = clamp(rawDelta, clampRange.min, clampRange.max);
  const eloDelta = Math.round(clampedDelta);
  const eloAfter = Math.max(0, eloBefore + eloDelta);
  const ratingDeviationAfter = getNextRatingDeviation(ratingDeviationBefore, input.totalSequences);

  return {
    eloBefore,
    eloAfter,
    eloDelta,
    kFactor,
    opponentElo,
    expectedScore,
    actualScore,
    rawDelta,
    clampedDelta,
    ratingDeviationBefore,
    ratingDeviationAfter,
    humanAvgCpl: null,
    engineAvgCpl: null,
    cplDiff: null,
    ratingMethod: "legacy",
  };
}

export function calculateMoveCplFromWhiteEval(move: CplAnalyzedMove) {
  const bestEvalCp = Number(move.bestEvalCp);
  const playedEvalCp = Number(move.playedEvalCp);
  if (!Number.isFinite(bestEvalCp) || !Number.isFinite(playedEvalCp)) return null;

  const sideBestEval = move.sideToMove === "b" ? -bestEvalCp : bestEvalCp;
  const sidePlayedEval = move.sideToMove === "b" ? -playedEvalCp : playedEvalCp;
  const cpl = Math.max(0, sideBestEval - sidePlayedEval);
  return Math.min(MAX_RATING_CPL, Math.round(cpl));
}

export function calculateMatchedEngineCplEloUpdate(input: {
  userEloAtGameStart: number;
  ratingDeviation?: number;
  totalSequences: number;
  humanMoves: CplAnalyzedMove[];
  engineMoves: CplAnalyzedMove[];
}): EloUpdateResult | null {
  const humanCpls = input.humanMoves
    .map(calculateMoveCplFromWhiteEval)
    .filter((value): value is number => typeof value === "number");
  const engineCpls = input.engineMoves
    .map(calculateMoveCplFromWhiteEval)
    .filter((value): value is number => typeof value === "number");

  if (humanCpls.length < MIN_CPL_MOVES_PER_SIDE || engineCpls.length < MIN_CPL_MOVES_PER_SIDE) {
    return null;
  }

  const eloBefore = Number.isFinite(input.userEloAtGameStart)
    ? Math.max(MIN_MATCHED_ENGINE_ELO, Math.round(input.userEloAtGameStart))
    : 500;
  const ratingDeviationBefore = normalizeRatingDeviation(input.ratingDeviation);
  const ratingDeviationAfter = getNextRatingDeviation(ratingDeviationBefore, input.totalSequences);
  const humanAvgCpl = average(humanCpls);
  const engineAvgCpl = average(engineCpls);
  const cplDiff = engineAvgCpl - humanAvgCpl;
  const rawDelta = MATCHED_ENGINE_MAX_DELTA * Math.tanh(cplDiff / MATCHED_ENGINE_CPL_SCALE);
  const eloDelta = Math.round(rawDelta);
  const eloAfter = Math.max(MIN_MATCHED_ENGINE_ELO, eloBefore + eloDelta);

  return {
    eloBefore,
    eloAfter,
    eloDelta,
    kFactor: MATCHED_ENGINE_MAX_DELTA,
    opponentElo: eloBefore,
    expectedScore: 0.5,
    actualScore: clamp(0.5 + cplDiff / (MATCHED_ENGINE_CPL_SCALE * 2), 0, 1),
    rawDelta,
    clampedDelta: eloDelta,
    ratingDeviationBefore,
    ratingDeviationAfter,
    humanAvgCpl: Math.round(humanAvgCpl),
    engineAvgCpl: Math.round(engineAvgCpl),
    cplDiff: Math.round(cplDiff),
    ratingMethod: "matched_engine_cpl",
  };
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.round(clamp(value, min, max));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type SkillLevel = "new_to_chess" | "beginner" | "intermediate" | "advanced" | "expert";

export const DEFAULT_RATING_DEVIATION = 650;
export const MIN_RATING_DEVIATION = 80;
export const MAX_RATING_DEVIATION = 700;
const MIN_ENGINE_CHALLENGE_ELO = 800;
const DEFAULT_CHALLENGE_ELO_OFFSET = 100;

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
}

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
    ? Math.max(0, Math.round(userElo))
    : 500;

  return Math.max(
    MIN_ENGINE_CHALLENGE_ELO,
    normalizedUserElo + DEFAULT_CHALLENGE_ELO_OFFSET,
  );
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
  };
}

function clampInteger(value: number, min: number, max: number) {
  return Math.round(clamp(value, min, max));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

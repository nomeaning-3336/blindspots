export type SkillLevel = "new_to_chess" | "beginner" | "intermediate" | "advanced";

export const DEFAULT_RATING_DEVIATION = 650;
export const MIN_RATING_DEVIATION = 80;
export const MAX_RATING_DEVIATION = 700;

export function getStartingEloForSkillLevel(skillLevel: SkillLevel) {
  switch (skillLevel) {
    case "new_to_chess":
      return 0;
    case "beginner":
      return 250;
    case "intermediate":
      return 500;
    case "advanced":
      return 1000;
  }
}

export function normalizeSkillLevel(value: unknown): SkillLevel {
  if (
    value === "new_to_chess" ||
    value === "beginner" ||
    value === "intermediate" ||
    value === "advanced"
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

  if (totalSequences <= 3) return Math.round(Math.min(900, Math.max(450, rd * 1.25)));
  if (totalSequences <= 8) return Math.round(Math.min(650, Math.max(220, rd * 0.95)));
  if (totalSequences <= 20) return Math.round(Math.min(240, Math.max(80, rd * 0.55)));

  return Math.round(Math.min(48, Math.max(20, rd * 0.25)));
}

export function getOpponentElo(userElo: number, totalSequences = 0) {
  const spread = getOpponentEloSpread(totalSequences);
  const offset = Math.round((Math.random() * 2 - 1) * spread);
  return Math.max(0, Math.round(userElo + offset));
}

export function getOpponentEloSpread(totalSequences: number) {
  if (totalSequences <= 3) return 350;
  if (totalSequences <= 8) return 250;
  if (totalSequences <= 20) return 150;
  return 75;
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

function getEloDeltaClamp(totalSequences: number, scoreDelta: number) {
  if (totalSequences <= 3) {
    return scoreDelta >= 0
      ? { min: -250, max: 550 }
      : { min: -220, max: 300 };
  }

  if (totalSequences <= 8) return { min: -180, max: 300 };
  if (totalSequences <= 20) return { min: -90, max: 120 };

  return { min: -35, max: 35 };
}

export function calculateEloUpdate(input: EloUpdateInput): EloUpdateResult | null {
  if (input.evalPreservationScore === null) return null;

  const eloBefore = Math.max(0, Math.round(input.currentElo));
  const ratingDeviationBefore = normalizeRatingDeviation(input.ratingDeviation);
  const kFactor = getKFactor(input.totalSequences, ratingDeviationBefore);
  const opponentElo = getOpponentElo(eloBefore, input.totalSequences);
  const expectedScore = calculateExpectedScore(eloBefore, opponentElo);
  const actualScore = clamp(input.evalPreservationScore, 0, 1);
  const scoreDelta = actualScore - expectedScore;
  const rawDelta = Math.round(kFactor * scoreDelta);

  const clampRange = getEloDeltaClamp(input.totalSequences, scoreDelta);
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

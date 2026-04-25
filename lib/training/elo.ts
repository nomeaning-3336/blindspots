export interface EloUpdateInput {
  currentElo: number;
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
}

export function getSeededStartingElo(totalCpLoss: number, totalMoves: number) {
  if (totalMoves <= 0) return 1200;
  const avgCpLoss = totalCpLoss / totalMoves;
  const seededElo = Math.round(2200 - avgCpLoss * 8);
  return clampInteger(seededElo, 600, 1800);
}

export function getKFactor(totalSequences: number) {
  if (totalSequences <= 10) return 64;
  if (totalSequences <= 30) return 32;
  if (totalSequences <= 100) return 24;
  return 16;
}

export function getOpponentElo(userElo: number) {
  return Math.max(400, Math.round(userElo));
}

export function calculateExpectedScore(userElo: number, opponentElo: number) {
  return 1 / (1 + Math.pow(10, (opponentElo - userElo) / 400));
}

export function calculateEloUpdate(input: EloUpdateInput): EloUpdateResult | null {
  if (input.evalPreservationScore === null) return null;

  const eloBefore = Math.max(400, Math.round(input.currentElo));
  const kFactor = getKFactor(input.totalSequences);
  const opponentElo = getOpponentElo(eloBefore);
  const expectedScore = calculateExpectedScore(eloBefore, opponentElo);
  const actualScore = clamp(input.evalPreservationScore, 0, 1);
  const scoreDelta = actualScore - expectedScore;
  const lossSeverity = scoreDelta < 0 ? getCpLossSeverity(input.totalCpLoss ?? 0) : 1;
  const rawDelta = Math.round(kFactor * scoreDelta * lossSeverity);
  const maxDelta = kFactor * (scoreDelta < 0 ? 4 : 1.5);
  const clampedDelta = clamp(rawDelta, -maxDelta, maxDelta);
  const eloDelta = Math.round(clampedDelta);
  const eloAfter = Math.max(400, eloBefore + eloDelta);

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
  };
}

function clampInteger(value: number, min: number, max: number) {
  return Math.round(clamp(value, min, max));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCpLossSeverity(totalCpLoss: number) {
  if (totalCpLoss <= 100) return 1;
  return 1 + Math.min(3, (totalCpLoss - 100) / 250);
}

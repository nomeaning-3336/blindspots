export const RESIGNABLE_CP_THRESHOLD = -900;
export const RESIGNABLE_BEST_LINE_CP_THRESHOLD = -700;
export const RESIGNABLE_MATE_AGAINST_MAX_PLY = 10;

export type ResignableResult = {
  isResignable: boolean;
  reason: string | null;
};

export function isResignablePosition(input: {
  evalCp?: number | null;
  mate?: number | null;
  engineLines?: Array<{ cp: number; mate?: number | null }>;
  sideToMove?: "white" | "black";
}): ResignableResult {
  if (isCheckmated(input)) {
    return { isResignable: true, reason: "terminal lost — side to move is checkmated" };
  }

  if (isForcedMateAgainst(input)) {
    return { isResignable: true, reason: "mate against side to move within threshold" };
  }

  if (isCrushingEvalNoSpread(input)) {
    return { isResignable: true, reason: "crushing eval with no practical decision spread" };
  }

  return { isResignable: false, reason: null };
}

function sideEval(cp: number | null | undefined, sideToMove?: "white" | "black", engineWhitePositive?: boolean): number | null {
  if (typeof cp !== "number" || !Number.isFinite(cp)) return null;
  const whitePositive = engineWhitePositive !== false;
  if (!whitePositive) return cp; // already side-to-move relative
  if (sideToMove === "black") return -cp;
  return cp;
}

function isCheckmated(input: { evalCp?: number | null; mate?: number | null; engineLines?: Array<{ cp: number; mate?: number | null }> }): boolean {
  if (typeof input.mate === "number" && input.mate === 0) {
    const hasLines = (input.engineLines?.length ?? 0) > 0;
    if (!hasLines) return true;
    if (typeof input.evalCp !== "number") return true;
  }
  return false;
}

function isForcedMateAgainst(input: {
  evalCp?: number | null;
  mate?: number | null;
  engineLines?: Array<{ cp: number; mate?: number | null }>;
  sideToMove?: "white" | "black";
}): boolean {
  if (typeof input.mate !== "number") return false;

  const mateAgainst = input.sideToMove === "white"
    ? (input.mate < 0)
    : (input.mate > 0);

  if (!mateAgainst) return false;

  const distance = Math.abs(input.mate);
  if (distance <= RESIGNABLE_MATE_AGAINST_MAX_PLY) return true;

  // Check engine lines: if all top lines show mate against within threshold
  const lines = input.engineLines ?? [];
  if (lines.length === 0) return false;

  const allMateAgainst = lines.every((line) => {
    if (typeof line.mate !== "number") return false;
    const against = input.sideToMove === "white"
      ? (line.mate < 0)
      : (line.mate > 0);
    return against && Math.abs(line.mate) <= RESIGNABLE_MATE_AGAINST_MAX_PLY + 5;
  });

  return allMateAgainst;
}

function isCrushingEvalNoSpread(input: {
  evalCp?: number | null;
  engineLines?: Array<{ cp: number; mate?: number | null }>;
  sideToMove?: "white" | "black";
}): boolean {
  const lines = input.engineLines ?? [];
  const evals = lines
    .map((l) => (typeof l.cp === "number" && Number.isFinite(l.cp) ? l.cp : null))
    .filter((c): c is number => c !== null);

  if (evals.length < 2) return false;

  // Convert white-positive CP to side-to-move-relative
  const sideEvals = evals.map((cp) => sideEval(cp, input.sideToMove) ?? cp);

  const best = Math.max(...sideEvals);

  // Best line must be below threshold
  if (best >= RESIGNABLE_BEST_LINE_CP_THRESHOLD) return false;

  // All lines must be hopeless (below -900)
  const allBelowThreshold = sideEvals.every((cp) => cp <= RESIGNABLE_CP_THRESHOLD);
  if (!allBelowThreshold) return false;

  // Small spread = no meaningful decision
  const worst = Math.min(...sideEvals);
  const spread = best - worst;
  const NO_MEANINGFUL_SPREAD = 200;
  return spread <= NO_MEANINGFUL_SPREAD;
}

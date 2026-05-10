const PHASE_WEIGHTS: Record<string, number> = {
  opening_exit: 1,
  middlegame: 1,
  endgame: 1,
};

const PHASES = Object.keys(PHASE_WEIGHTS);

export function totalPiecesFromFen(fen: string): number {
  const board = fen.split(" ")[0];
  let count = 0;
  for (const char of board) {
    if (/[pnbrqkPNBRQK]/.test(char)) count++;
  }
  return count;
}

export function hasLikelySyzygyTablebaseEntry(fen: string): boolean {
  return totalPiecesFromFen(fen) <= 7;
}

export function selectRandomPhase(): string {
  const entries = PHASES.map((phase) => ({ phase, weight: PHASE_WEIGHTS[phase] ?? 0 }));
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);

  let roll = Math.random() * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.phase;
  }

  return entries[entries.length - 1]?.phase ?? "middlegame";
}

export function inferPhaseFromFen(fen: string): string | null {
  const pieces = totalPiecesFromFen(fen);
  // Rough heuristic: 28+ pieces = opening, 14-27 = middlegame, <14 = endgame
  if (pieces >= 28) return "opening_exit";
  if (pieces >= 14) return "middlegame";
  return "endgame";
}

export function getPhaseFallbackOrder(preferred: string): string[] {
  const others = PHASES.filter((p) => p !== preferred);
  // Shuffle fallback phases so we don't always bias the same order
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  return [preferred, ...others];
}

const RESIGNABLE_CP = -900;
const RESIGNABLE_LINE_CP = -700;
const RESIGNABLE_MATE_MAX = 10;

const OVERWHELMING_WIN_CP = 900;
const OVERWHELMING_WIN_LINE_CP = 700;
const TRIVIAL_MATE_FOR_MAX = 5;

const MEANINGFUL_SPREAD_CP = 350;

export type NonInstructiveResult = {
  isNonInstructive: boolean;
  category: "resignable" | "overwhelmingly_winning" | "terminal" | null;
  reason: string | null;
};

export function isNonInstructivePosition(input: {
  fen?: string;
  evalCp?: number | null;
  mate?: number | null;
  engineLines?: Array<{ cp: number; mate?: number | null }>;
  scorePerspective?: "white-positive" | "side-to-move";
}): NonInstructiveResult {
  const lines = input.engineLines ?? [];
  const lineCps = lines.map((l) =>
    typeof l.cp === "number" && Number.isFinite(l.cp) ? l.cp : null,
  ).filter((c): c is number => c !== null);

  // Terminal: no engine lines available (game over)
  if (lines.length === 0 && typeof input.evalCp !== "number" && typeof input.mate === "number") {
    return { isNonInstructive: true, category: "terminal", reason: "game over — no engine lines available" };
  }

  // ── Resignable / hopelessly lost ───────────────────────────────

  if (isForcedMateAgainst(input, lines)) {
    return { isNonInstructive: true, category: "resignable", reason: "forced mate against the player within threshold" };
  }

  if (lineCps.length >= 2) {
    const best = Math.max(...lineCps);
    const worst = Math.min(...lineCps);
    const allHopeless = lineCps.every((c) => c <= RESIGNABLE_LINE_CP);
    const spread = best - worst;

    if (best <= RESIGNABLE_LINE_CP && allHopeless && spread <= MEANINGFUL_SPREAD_CP) {
      return { isNonInstructive: true, category: "resignable", reason: "all lines hopeless with no meaningful spread" };
    }
  }

  // ── Overwhelmingly winning ─────────────────────────────────────

  if (isTrivialMateFor(input, lines)) {
    return { isNonInstructive: true, category: "overwhelmingly_winning", reason: "trivial forced mate for the player" };
  }

  if (lineCps.length >= 2) {
    const best = Math.max(...lineCps);
    const worst = Math.min(...lineCps);
    const topThree = lineCps.slice(0, 3);
    const allOverwhelming = topThree.every((c) => c >= OVERWHELMING_WIN_LINE_CP);
    const spread = best - worst;

    if (best >= OVERWHELMING_WIN_CP && allOverwhelming && spread <= MEANINGFUL_SPREAD_CP) {
      return { isNonInstructive: true, category: "overwhelmingly_winning", reason: "all lines overwhelmingly winning with no meaningful spread" };
    }
  }

  return { isNonInstructive: false, category: null, reason: null };
}

function isForcedMateAgainst(
  input: { evalCp?: number | null; mate?: number | null },
  lines: Array<{ cp: number; mate?: number | null }>,
): boolean {
  if (typeof input.mate !== "number") return false;
  if (input.mate >= 0) return false;
  if (Math.abs(input.mate) > RESIGNABLE_MATE_MAX) return false;
  if (lines.length === 0) return true;
  return lines.every((l) => typeof l.mate === "number" && l.mate < 0 && Math.abs(l.mate) <= RESIGNABLE_MATE_MAX);
}

function isTrivialMateFor(
  input: { evalCp?: number | null; mate?: number | null },
  lines: Array<{ cp: number; mate?: number | null }>,
): boolean {
  if (typeof input.mate !== "number") return false;
  if (input.mate <= 0) return false;
  if (Math.abs(input.mate) > TRIVIAL_MATE_FOR_MAX) return false;

  if (lines.length === 0) return true;
  if (lines.length < 2) return false; // need at least 2 lines to determine triviality

  // Count how many top lines preserve the win
  const mateLines = lines.filter((l) => typeof l.mate === "number" && l.mate > 0);
  const winLines = lines.filter((l) => typeof l.cp === "number" && l.cp >= 700);

  // If most top lines are winning/mating, it's trivial
  const totalWinning = mateLines.length + winLines.length;
  return totalWinning >= lines.length * 0.6;
}

/**
 * Phase-balanced training position serving policy.
 *
 * Target mix per 20 serves:
 * - opening:       3–4 (15–20%)
 * - middlegame:     8–9 (40–45%)
 * - endgame:        4     (20%)
 * - tactic:         3–4 (15–20%)
 * - wildcard:       1     (5%)
 *
 * Priority: due revisit always wins.
 * Fallback: when no candidates for the chosen mode, fall back to exploit/explore queues.
 */

export type ServeMode =
  | "revisit"
  | "tactic"
  | "opening"
  | "middlegame"
  | "endgame"
  | "exploit"
  | "explore"
  | "wildcard";

type ServeModeCount = {
  opening: number;
  middlegame: number;
  endgame: number;
  tactic: number;
  wildcard: number;
};

const TARGET_WINDOW = 20;

const TARGET_COUNTS: ServeModeCount = {
  opening: 3,      // 3 of 20 = 15%
  middlegame: 9,    // 9 of 20 = 45%
  endgame: 4,       // 4 of 20 = 20%
  tactic: 3,        // 3 of 20 = 15%
  wildcard: 1,      // 1 of 20 = 5%
};

const MIN_COUNTS: ServeModeCount = {
  opening: 2,       // 2 of 20 = 10%
  middlegame: 8,    // 8 of 20 = 40%
  endgame: 2,       // 2 of 20 = 10%
  tactic: 2,        // 2 of 20 = 10%
  wildcard: 0,
};

export function randomExplorationProbability(totalSequences: number): number {
  const initial = 0.75;
  const floor = 0.30;
  const halfLife = 20;
  const normalizedTotal = Math.max(0, Number.isFinite(totalSequences) ? totalSequences : 0);

  return floor + (initial - floor) * Math.exp(-normalizedTotal / halfLife);
}

export type RecentModeEntry = {
  mode: ServeMode;
  servedAt: string;
};

/**
 * Normalize recent served modes from a JSON value.
 */
export function normalizeRecentServedModes(value: unknown): RecentModeEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;
    if (typeof e.mode !== "string") return [];
    const mode = e.mode as string;
    if (!["revisit", "tactic", "opening", "middlegame", "endgame", "exploit", "explore", "wildcard"].includes(mode)) {
      return [];
    }
    return [{
      mode: mode as ServeMode,
      servedAt: typeof e.servedAt === "string" ? e.servedAt : new Date().toISOString(),
    }];
  });
}

/**
 * Count modes in the recent window (newest TARGET_WINDOW entries).
 * recentModes is newest-first from prependRecentServeMode.
 */
function countModesInWindow(recentModes: RecentModeEntry[]): ServeModeCount {
  const window = recentModes.slice(0, TARGET_WINDOW);
  const counts: ServeModeCount = { opening: 0, middlegame: 0, endgame: 0, tactic: 0, wildcard: 0 };
  for (const entry of window) {
    if (entry.mode === "opening") counts.opening += 1;
    else if (entry.mode === "middlegame") counts.middlegame += 1;
    else if (entry.mode === "endgame") counts.endgame += 1;
    else if (entry.mode === "tactic") counts.tactic += 1;
    else if (entry.mode === "wildcard") counts.wildcard += 1;
  }
  return counts;
}

function isBelowTarget(counts: ServeModeCount): boolean {
  return (
    counts.opening < TARGET_COUNTS.opening ||
    counts.middlegame < TARGET_COUNTS.middlegame ||
    counts.endgame < TARGET_COUNTS.endgame ||
    counts.tactic < TARGET_COUNTS.tactic ||
    counts.wildcard < TARGET_COUNTS.wildcard
  );
}

/**
 * Choose the next serve mode based on rolling window state and priorities.
 */
export function chooseServeMode(input: {
  completedSequenceCount: number;
  dueRevisitCount: number;
  recentModes?: RecentModeEntry[];
  rng?: () => number;
}): ServeMode {
  const { completedSequenceCount, dueRevisitCount, recentModes = [], rng = Math.random } = input;

  // Priority 1: if any position is due for revisit, always serve revisit
  if (dueRevisitCount > 0) {
    return "revisit";
  }

  // Priority 2: rolling window enforcement
  if (recentModes.length > 0) {
    const counts = countModesInWindow(recentModes);

    // Force modes below minimum (guarantee floor)
    if (counts.tactic < MIN_COUNTS.tactic) return "tactic";
    if (counts.opening < MIN_COUNTS.opening) return "opening";
    if (counts.endgame < MIN_COUNTS.endgame) return "endgame";

    // Prefer modes below target, with small randomness
    const belowTarget: Array<{ mode: ServeMode; urgency: number }> = [];
    if (counts.opening < TARGET_COUNTS.opening) {
      belowTarget.push({ mode: "opening", urgency: TARGET_COUNTS.opening - counts.opening });
    }
    if (counts.middlegame < TARGET_COUNTS.middlegame) {
      belowTarget.push({ mode: "middlegame", urgency: TARGET_COUNTS.middlegame - counts.middlegame });
    }
    if (counts.endgame < TARGET_COUNTS.endgame) {
      belowTarget.push({ mode: "endgame", urgency: TARGET_COUNTS.endgame - counts.endgame });
    }
    if (counts.tactic < TARGET_COUNTS.tactic) {
      belowTarget.push({ mode: "tactic", urgency: TARGET_COUNTS.tactic - counts.tactic });
    }
    if (counts.wildcard < TARGET_COUNTS.wildcard) {
      belowTarget.push({ mode: "wildcard", urgency: TARGET_COUNTS.wildcard - counts.wildcard });
    }

    if (belowTarget.length > 0) {
      // Sort by urgency descending and pick from top 2 with randomness
      belowTarget.sort((a, b) => b.urgency - a.urgency);
      const top = belowTarget.slice(0, 2);
      return top[Math.floor(rng() * top.length)]!.mode;
    }

    // All targets met — default to middlegame/exploit with small randomness
    if (rng() < 0.7) return "middlegame";
    if (rng() < 0.85) return "exploit";
    return "wildcard";
  }

  // No history — deterministic fallback for new profile
  const n = completedSequenceCount;
  if (n === 0) return "opening";                         // first serve: opening
  if (n > 0 && n % 7 === 0) return "tactic";             // every 7th: tactic
  if (n > 0 && n % 5 === 0) return "opening";            // every 5th: opening
  if (n > 0 && n % 6 === 0) return "endgame";           // every 6th: endgame
  if (n > 0 && n % 4 === 0) return "wildcard";          // every 4th: wildcard
  if (n % 3 === 2) return "explore";
  return "middlegame";
}

/**
 * Prepend a new mode to the recent modes list, keeping last 50.
 */
export function prependRecentServeMode(
  recentModes: RecentModeEntry[],
  mode: ServeMode,
): RecentModeEntry[] {
  const entry: RecentModeEntry = { mode, servedAt: new Date().toISOString() };
  return [entry, ...recentModes].slice(0, 50);
}

/**
 * Map a serve mode to a TrainingPhase for bucket classification.
 */
export function serveModeToPhase(mode: ServeMode): "opening" | "middlegame" | "endgame" | "tactic" | "wildcard" | "exploit" | "explore" | "revisit" {
  return mode;
}

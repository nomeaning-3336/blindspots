/**
 * Serve-mode seed candidate sampler.
 * Returns positions filtered by serve mode for phase-balanced selection.
 */

import type { TrainingQueueItem } from "./queue-core";
import { sampleOpeningPositions, sampleTacticalPositions, samplePhasePositions } from "./queues";
import type { ServeMode } from "./serving-policy";

export async function getModeSeedCandidates(
  mode: string,
  excludeFens: Set<string>,
  now: Date,
  count = 30,
): Promise<TrainingQueueItem[]> {
  switch (mode) {
    case "opening":
    case "opening_gambit":
    case "opening_development":
      return sampleOpeningPositions(count, excludeFens, now);
    case "tactic":
      return sampleTacticalPositions(count, excludeFens, now);
    case "endgame":
      return samplePhasePositions("endgame", count, excludeFens, now);
    case "middlegame":
    case "middlegame_attack":
    case "middlegame_positional":
      return samplePhasePositions("middlegame", count, excludeFens, now);
    case "wildcard":
      // Wildcard uses elite explore sampling (generic diversification)
      return [];
    case "exploit":
    case "explore":
      return [];
    case "revisit":
      return [];
    default:
      return [];
  }
}

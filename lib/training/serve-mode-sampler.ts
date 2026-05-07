/**
 * Serve-mode seed candidate sampler.
 * Returns positions filtered by serve mode for phase-balanced selection.
 */

import type { TrainingQueueItem } from "./queue-core";
import { sampleOpeningPositions, sampleTacticalPositions, sampleEndgamePositions, sampleMiddlegamePositions, sampleWildcardPositions } from "./queues";

export async function getModeSeedCandidates(
  mode: string,
  excludeFens: Set<string>,
  now: Date,
  count = 30,
): Promise<TrainingQueueItem[]> {
  switch (mode) {
    case "opening":
      return sampleOpeningPositions(count, excludeFens, now);
    case "opening_gambit":
      return sampleOpeningPositions(count, excludeFens, now, "opening_gambit");
    case "opening_development":
      return sampleOpeningPositions(count, excludeFens, now, "opening_development");
    case "tactic":
      return sampleTacticalPositions(count, excludeFens, now);
    case "endgame":
      return sampleEndgamePositions(count, excludeFens, now);
    case "endgame_rook":
      return sampleEndgamePositions(count, excludeFens, now, "endgame_rook");
    case "endgame_pawn":
      return sampleEndgamePositions(count, excludeFens, now, "endgame_pawn");
    case "middlegame":
      return sampleMiddlegamePositions(count, excludeFens, now);
    case "middlegame_attack":
      return sampleMiddlegamePositions(count, excludeFens, now, "middlegame_attack");
    case "middlegame_positional":
      return sampleMiddlegamePositions(count, excludeFens, now, "middlegame_positional");
    case "wildcard":
      return sampleWildcardPositions(count, excludeFens, now);
    case "exploit":
    case "explore":
      return [];
    case "revisit":
      return [];
    default:
      return [];
  }
}

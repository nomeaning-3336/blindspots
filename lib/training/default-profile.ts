import type { Json } from "../supabase/database";

export const DEFAULT_BLINDSPOTS_ELO = 1200;
export const DEFAULT_RATING_DEVIATION = 650;
export type SkillLevel = "new_to_chess" | "beginner" | "intermediate" | "advanced" | "expert";

export type DefaultBlindspotProfile = {
  user_id: string;
  blindspots_elo: number;
  rating_deviation: number;
  initial_skill_level: SkillLevel;
  initialization_status: "complete";
  initialization_completed_at: string;
  profile_initialized: true;
  weakness_vector: Json;
  mastery_vector: Json;
  exploit_queue: Json;
  explore_queue: Json;
  revisit_queue: Json;
  mastered_queue: Json;
  total_sequences: number;
  next_filler_cursor: number;
  recent_served_fens: Json;
  recent_served_modes: Json;
  bucket_stats: Json;
};

export function buildDefaultBucketStats(): Json {
  return {
    opening: { alpha: 1, beta: 1, attempts: 0 },
    middlegame: { alpha: 1, beta: 1, attempts: 0 },
    endgame: { alpha: 1, beta: 1, attempts: 0 },
    tactic: { alpha: 1, beta: 1, attempts: 0 },
    opening_gambit: { alpha: 1, beta: 1, attempts: 0 },
    opening_development: { alpha: 1, beta: 1, attempts: 0 },
    middlegame_attack: { alpha: 1, beta: 1, attempts: 0 },
    middlegame_positional: { alpha: 1, beta: 1, attempts: 0 },
    endgame_rook: { alpha: 1, beta: 1, attempts: 0 },
    endgame_pawn: { alpha: 1, beta: 1, attempts: 0 },
    wildcard: { alpha: 1, beta: 1, attempts: 0 },
  };
}

export function buildDefaultBlindspotProfile(
  userId: string,
  nowIso = new Date().toISOString(),
): DefaultBlindspotProfile {
  return {
    user_id: userId,
    blindspots_elo: DEFAULT_BLINDSPOTS_ELO,
    rating_deviation: DEFAULT_RATING_DEVIATION,
    initial_skill_level: "beginner",
    initialization_status: "complete",
    initialization_completed_at: nowIso,
    profile_initialized: true,
    weakness_vector: {},
    mastery_vector: {},
    exploit_queue: [],
    explore_queue: [],
    revisit_queue: [],
    mastered_queue: [],
    total_sequences: 0,
    next_filler_cursor: 0,
    recent_served_fens: [],
    recent_served_modes: [],
    bucket_stats: buildDefaultBucketStats(),
  };
}

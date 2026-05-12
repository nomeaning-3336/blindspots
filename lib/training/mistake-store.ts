import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database";
import { nextIntervalDays, shouldMasterMistake, addDays, type TrainingOutcome } from "./mistake-srs";
import { inferLegalMoveBetweenFens } from "./fen-transition";
import { normalizeSetupPrelude } from "./setup-prelude";
import { getNextReviewAtForActiveMistake, nextConsecutiveCorrectCount } from "./active-mistake-schedule";
import { selectRandomPhase, getPhaseFallbackOrder, hasLikelySyzygyTablebaseEntry, inferPhaseFromFen } from "./random-filler-selection";
import { isNonInstructivePosition } from "./non-instructive-position";

type UserMistakeUpdate = Database["public"]["Tables"]["user_mistakes"]["Update"];

export interface UserMistakeRow {
  id: string;
  user_id: string;
  source_type: string;
  source_provider: string | null;
  source_game_id: string | null;
  source_game_url: string | null;
  linked_profile_id: string | null;
  game_played_at: string | null;
  ply: number | null;
  user_color: string | null;
  starting_fen: string;
  decision_fen: string | null;
  actual_move_uci: string | null;
  actual_move_san: string | null;
  best_move_uci: string | null;
  best_move_san: string | null;
  eval_before_cp: number | null;
  eval_after_cp: number | null;
  cp_loss: number | null;
  theme_tags: unknown;
  opening_name: string | null;
  eco: string | null;
  status: string;
  interval_days: number;
  review_count: number;
  pass_count: number;
  acceptable_count: number;
  fail_count: number;
  last_attempt_at: string | null;
  next_review_at: string | null;
  first_ingested_at: string;
  last_served_at: string | null;
  served_count: number;
  mastered_at: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NextMistakeResult {
  mistake: UserMistakeRow | null;
  queueSource: "review" | "active" | "filler" | null;
  selectedPhase?: string;
}

/**
 * App-training active mistake with pre-validated setup prelude fields.
 */
export interface ActiveAppMistake {
  id: string;
  decisionFen: string;
  actualMoveUci: string;
  actualMoveSan: string | null;
  cpLoss: number | null;
  classification: string | null;
  severity: string | null;
  setupPreviousFen: string;
  setupPlayedMoveUci: string;
  setupPlayedMoveSan: string | null;
  sourceType: string;
  sourceProvider: string | null;
}

/**
 * Fetch the next due active app-training mistake that has a valid setup prelude.
 *
 * Queries user_mistakes for source_type = 'app_training', status = 'active',
 * next_review_at <= now. Validates setup prelude fields before returning.
 * Invalid rows (missing or broken preludes) are skipped and counted.
 */
export async function getNextActiveAppMistake(
  userId: string,
  now: Date = new Date(),
): Promise<{ mistake: ActiveAppMistake | null; rejectedNoPreludeCount: number; candidateCount: number }> {
  const supabase = getSupabaseAdminClient();
  const nowISO = now.toISOString();

  const batchSize = 20;
  const { data: candidates, error } = await supabase
    .from("user_mistakes" as any)
    .select("*")
    .eq("user_id", userId)
    .eq("source_type", "app_training")
    .eq("status", "active")
    .is("retired_at", null)
    .is("mastered_at", null)
    .lte("next_review_at", nowISO)
    .order("next_review_at", { ascending: true })
    .order("cp_loss", { ascending: false, nullsFirst: false })
    .limit(batchSize);

  if (error) {
    console.error("[mistake-store] active app mistake query failed", error);
    return { mistake: null, rejectedNoPreludeCount: 0, candidateCount: 0 };
  }

  const rows = Array.isArray(candidates) ? candidates : [];
  let rejectedNoPreludeCount = 0;

  for (const row of rows as any[]) {
    const decisionFen = typeof row.decision_fen === "string" ? row.decision_fen : "";
    const setupPreviousFen = typeof row.setup_previous_fen === "string" ? row.setup_previous_fen : "";
    const setupPlayedMoveUci = typeof row.setup_played_move_uci === "string" ? row.setup_played_move_uci : "";

    if (!decisionFen || !setupPreviousFen || !setupPlayedMoveUci) {
      rejectedNoPreludeCount++;
      continue;
    }

    // Validate the stored prelude. We do NOT infer — only use stored fields.
    const prelude = normalizeSetupPrelude({
      fen: decisionFen,
      previousFen: setupPreviousFen,
      playedMove: setupPlayedMoveUci,
    });

    if (!prelude) {
      rejectedNoPreludeCount++;
      continue;
    }

    // Update served_count / last_served_at
    await supabase
      .from("user_mistakes" as any)
      .update({
        served_count: ((row.served_count ?? 0) + 1),
        last_served_at: nowISO,
      })
      .eq("id", row.id)
      .eq("user_id", userId);

    return {
      mistake: {
        id: row.id,
        decisionFen,
        actualMoveUci: typeof row.actual_move_uci === "string" ? row.actual_move_uci : "",
        actualMoveSan: typeof row.actual_move_san === "string" ? row.actual_move_san : null,
        cpLoss: typeof row.cp_loss === "number" ? row.cp_loss : null,
        classification: typeof row.classification === "string" ? row.classification : null,
        severity: typeof row.severity === "string" ? row.severity : null,
        setupPreviousFen,
        setupPlayedMoveUci,
        setupPlayedMoveSan: typeof row.setup_played_move_san === "string" ? row.setup_played_move_san : null,
        sourceType: "app_training",
        sourceProvider: "blindspots",
      },
      rejectedNoPreludeCount,
      candidateCount: rows.length,
    };
  }

  return { mistake: null, rejectedNoPreludeCount, candidateCount: rows.length };
}

export async function getNextMistakeForTraining(
  userId: string,
  now: Date = new Date(),
): Promise<NextMistakeResult> {
  const review = await getNextReviewMistakeForTraining(userId, now);
  if (review.mistake) return review;
  return getNextActiveOrFillerMistakeForTraining(userId, now);
}

export async function getNextReviewMistakeForTraining(
  userId: string,
  now: Date = new Date(),
): Promise<NextMistakeResult> {
  const supabase = getSupabaseAdminClient();
  const nowISO = now.toISOString();

  const { data: review, error: reviewError } = await supabase
    .from("user_mistakes")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "review")
    .is("retired_at", null)
    .is("mastered_at", null)
    .lte("next_review_at", nowISO)
    .order("next_review_at", { ascending: true })
    .order("fail_count", { ascending: false })
    .order("cp_loss", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (reviewError) {
    console.error("[mistake-store] review query failed", reviewError);
  }

  if (review) {
    await supabase
      .from("user_mistakes")
      .update({
        served_count: (review.served_count ?? 0) + 1,
        last_served_at: nowISO,
      })
      .eq("id", review.id)
      .eq("user_id", userId);

    return { mistake: review as unknown as UserMistakeRow, queueSource: "review" };
  }

  return { mistake: null, queueSource: null };
}

export async function getNextActiveOrFillerMistakeForTraining(
  userId: string,
  now: Date = new Date(),
): Promise<NextMistakeResult> {
  const supabase = getSupabaseAdminClient();
  const nowISO = now.toISOString();

  const { data: active, error: activeError } = await supabase
    .from("user_mistakes")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("retired_at", null)
    .is("mastered_at", null)
    .eq("review_count", 0)
    .in("source_type", ["own_game", "imported_pgn"])
    .order("game_played_at", { ascending: false, nullsFirst: false })
    .order("cp_loss", { ascending: false, nullsFirst: false })
    .order("first_ingested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError) {
    console.error("[mistake-store] active query failed", activeError);
  }

  if (active) {
    await supabase
      .from("user_mistakes")
      .update({
        served_count: (active.served_count ?? 0) + 1,
        last_served_at: nowISO,
      })
      .eq("id", active.id)
      .eq("user_id", userId);

    return { mistake: active as unknown as UserMistakeRow, queueSource: "active" };
  }

  // Phase-balanced filler selection
  const preferredPhase = selectRandomPhase();
  const phaseOrder = getPhaseFallbackOrder(preferredPhase);

  // Fetch a small batch of candidates sorted by least-recently-served
  const { data: fillerCandidates, error: fillerError } = await supabase
    .from("user_mistakes")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("source_type", "lichess_puzzle_filler")
    .is("retired_at", null)
    .is("mastered_at", null)
    .order("last_served_at", { ascending: true, nullsFirst: true })
    .order("first_ingested_at", { ascending: true })
    .limit(10);

  if (fillerError) {
    console.error("[mistake-store] filler query failed", fillerError);
  }

  const candidates = (fillerCandidates ?? []) as unknown as UserMistakeRow[];

  // Pick best candidate: prefer target phase, exclude resignable, endgame Syzygy
  let filler: UserMistakeRow | null = null;
  for (const phase of phaseOrder) {
    for (const c of candidates) {
      if (phase === "endgame" && hasLikelySyzygyTablebaseEntry(c.starting_fen)) continue;
      if (isNonInstructivePosition({
        evalCp: (c as any).eval_before_cp,
      }).isNonInstructive) {
        if (process.env.NODE_ENV !== "production") {
          console.debug("[training-filter] skipped resignable filler position", {
            id: c.id,
            fen: c.starting_fen,
          });
        }
        continue;
      }
      const candidatePhase = (c as any).phase ?? inferPhaseFromFen(c.starting_fen);
      if (candidatePhase === phase || !candidatePhase) {
        filler = c;
        break;
      }
    }
    if (filler) break;
  }

  // Fallback: just use the first candidate regardless of phase
  if (!filler && candidates.length > 0) {
    filler = candidates[0];
  }

  if (filler) {
    await supabase
      .from("user_mistakes")
      .update({
        served_count: (filler.served_count ?? 0) + 1,
        last_served_at: nowISO,
      })
      .eq("id", filler.id)
      .eq("user_id", userId);

    return { mistake: filler, queueSource: "filler", selectedPhase: preferredPhase };
  }

  return { mistake: null, queueSource: null };
}

export async function updateMistakeAfterTraining(input: {
  userId: string;
  mistakeId: string;
  outcome: TrainingOutcome;
  averageCpLoss: number;
  maxSingleCpLoss: number;
  now?: Date;
}): Promise<UserMistakeRow> {
  const supabase = getSupabaseAdminClient();
  const now = input.now ?? new Date();

  const { data: row, error } = await supabase
    .from("user_mistakes")
    .select("*")
    .eq("id", input.mistakeId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (error || !row) {
    throw new Error(
      `[mistake-store] Failed to load mistake ${input.mistakeId}: ${error?.message ?? "not found"}`,
    );
  }

  const MASTERED_FAIL_FLOOR_DAYS = 30;
  // Fail on a mastered mistake shouldn't drop the interval back to 1 day —
  // it stays at a 30-day floor and the row never leaves mastered.
  const currentInterval = Math.max(1, row.interval_days ?? 1);
  let newInterval = nextIntervalDays({
    currentIntervalDays: currentInterval,
    outcome: input.outcome,
  });

  const isMasteredFail = row.status === "mastered" && input.outcome === "fail";
  if (isMasteredFail) {
    newInterval = Math.max(newInterval, MASTERED_FAIL_FLOOR_DAYS);
  }
  const nextReviewDate = addDays(now, newInterval);

  const updates: UserMistakeUpdate = {
    review_count: (row.review_count ?? 0) + 1,
    last_attempt_at: now.toISOString(),
    next_review_at: nextReviewDate.toISOString(),
    interval_days: newInterval,
  };

  if (input.outcome === "pass") {
    updates.pass_count = (row.pass_count ?? 0) + 1;
  } else if (input.outcome === "acceptable") {
    updates.acceptable_count = (row.acceptable_count ?? 0) + 1;
  } else {
    updates.fail_count = (row.fail_count ?? 0) + 1;
  }

  if (isMasteredFail) {
    // Stay mastered, just with a floor-bumped interval
  } else if (shouldMasterMistake({ intervalDays: newInterval, outcome: input.outcome })) {
    updates.status = "mastered";
    updates.mastered_at = now.toISOString();
    updates.next_review_at = null;
  } else {
    updates.status = "review";
  }

  const { data: updated, error: updateError } = await supabase
    .from("user_mistakes")
    .update(updates)
    .eq("id", input.mistakeId)
    .eq("user_id", input.userId)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new Error(
      `[mistake-store] Failed to update mistake ${input.mistakeId}: ${updateError?.message ?? "no row returned"}`,
    );
  }

  return updated as UserMistakeRow;
}

export function normalizeUserMistakeForTraining(row: UserMistakeRow): {
  id: string;
  fen: string;
  decisionFen: string | null;
  previousFen: string | null;
  playedMove: string | null;
  actualMoveUci: string | null;
  actualMoveSan: string | null;
  bestMoveUci: string | null;
  bestMoveSan: string | null;
  source: string;
  queueSource: string;
} {
  let playedMove: string | null = null;
  const decisionFen =
    row.decision_fen && row.decision_fen !== row.starting_fen
      ? row.decision_fen
      : null;

  if (decisionFen) {
    playedMove = inferLegalMoveBetweenFens({
      fromFen: row.starting_fen,
      toFen: decisionFen,
    });
  }

  return {
    id: row.id,
    fen: decisionFen ?? row.starting_fen,
    decisionFen: row.decision_fen ?? null,
    previousFen: decisionFen ? row.starting_fen : null,
    playedMove,
    actualMoveUci: row.actual_move_uci ?? null,
    actualMoveSan: row.actual_move_san ?? null,
    bestMoveUci: row.best_move_uci ?? null,
    bestMoveSan: row.best_move_san ?? null,
    source: row.source_type,
    queueSource: row.status === "review" ? "review" : row.source_type,
  };
}

// ── Active mistake rescheduling ────────────────────────────────────

/**
 * Update an active app-training mistake after the user completes a training
 * sequence that was served from this mistake.
 *
 * Only reschedules and tracks consecutive_correct_count.
 * Does NOT change status (stays "active") — intermediary/graduated come later.
 */
export async function updateActiveMistakeAfterTraining(input: {
  userId: string;
  mistakeId: string;
  wasCorrect: boolean;
  now?: Date;
}): Promise<UserMistakeRow> {
  const supabase = getSupabaseAdminClient();
  const now = input.now ?? new Date();

  // Load current row
  const { data: row, error } = await supabase
    .from("user_mistakes" as any)
    .select("id, consecutive_correct_count, review_count, fail_count, pass_count")
    .eq("id", input.mistakeId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (error || !row) {
    throw new Error(
      `[mistake-store] Failed to load active mistake ${input.mistakeId}: ${error?.message ?? "not found"}`,
    );
  }

  const existingRow = row as any;
  const prevStreak = typeof existingRow.consecutive_correct_count === "number"
    ? existingRow.consecutive_correct_count
    : 0;

  const nextStreak = input.wasCorrect ? prevStreak + 1 : 0;
  const nextReviewAt = getNextReviewAtForActiveMistake({
    wasCorrect: input.wasCorrect,
    consecutiveCorrectCountBefore: prevStreak,
    now,
  }).toISOString();

  const updates: Record<string, unknown> = {
    consecutive_correct_count: nextStreak,
    next_review_at: nextReviewAt,
    last_attempt_at: now.toISOString(),
    review_count: ((existingRow.review_count ?? 0) + 1),
  };

  if (input.wasCorrect) {
    updates.pass_count = ((existingRow.pass_count ?? 0) + 1);
  } else {
    updates.fail_count = ((existingRow.fail_count ?? 0) + 1);
  }

  const { data: updated, error: updateError } = await supabase
    .from("user_mistakes" as any)
    .update(updates)
    .eq("id", input.mistakeId)
    .eq("user_id", input.userId)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new Error(
      `[mistake-store] Failed to update active mistake ${input.mistakeId}: ${updateError?.message ?? "no row returned"}`,
    );
  }

  return updated as unknown as UserMistakeRow;
}

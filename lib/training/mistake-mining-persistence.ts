/**
 * Persistence helpers for app-native mistake mining.
 * Contains extraction logic (which needs chess.js transitive imports)
 * and Supabase DB operations (which need service client).
 */

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database";
import {
  classifyMistakeSeverity,
  nextReviewAtForMinedMistake,
  isMineableUserMistake,
} from "./mistake-mining";
import { extractMineableMistakesFromSequence } from "./mistake-extraction";
import type { MineableMove, MineableMoveInput, MiningSummary } from "./mistake-mining";

// ── Persistence ────────────────────────────────────────────────────

/**
 * Upsert mined active mistakes into the user_training_items table.
 * Uses (user_id, move_key) for deduplication.
 * On conflict: preserves existing review_count/pass_count,
 * updates latest fail data, resets to active status.
 */
export async function upsertMinedActiveMistakes(
  mistakes: MineableMove[],
  userId: string,
  sessionId: string,
  now: Date = new Date(),
): Promise<MiningSummary> {
  const summary: MiningSummary = {
    mineableCount: mistakes.length,
    insertedCount: 0,
    updatedCount: 0,
    skippedMissingDecisionFen: 0,
    skippedMissingUci: 0,
    skippedNonFailed: 0,
    missingPreludeCount: 0,
  };

  if (mistakes.length === 0) return summary;

  const supabase = getSupabaseAdminClient();
  const nowIso = now.toISOString();

  for (const m of mistakes) {
    const severity = classifyMistakeSeverity({
      classification: m.classification,
      cpLoss: m.cpLoss,
      mateBefore: m.mateBefore,
      mateAfter: m.mateAfter,
    });
    const nextReviewAt = nextReviewAtForMinedMistake(severity, now).toISOString();

    if (!m.setupPreviousFen || !m.setupPlayedMoveUci) {
      summary.missingPreludeCount += 1;
      continue;
    }

    // Check if a row already exists for this user + move_key
    const { data: existing } = await supabase
      .from("user_training_items" as any)
      .select("id, fail_count, pass_count, review_count, cp_loss")
      .eq("user_id", userId)
      .eq("move_key", m.moveKey)
      .maybeSingle();

    if (existing) {
      const existingRow = existing as any;
      const existingCpLoss = typeof existingRow.cp_loss === "number" ? existingRow.cp_loss : 0;

      const { error } = await supabase
        .from("user_training_items" as any)
        .update({
          source_type: "app_training",
          source_provider: "blindspots",
          source_game_id: sessionId,
          starting_fen: m.decisionFen,
          decision_fen: m.decisionFen,
          actual_move_uci: m.uci,
          actual_move_san: m.san,
          result_fen: m.fenAfterUserMove,
          setup_previous_fen: m.setupPreviousFen,
          setup_played_move_uci: m.setupPlayedMoveUci,
          setup_played_move_san: m.setupPlayedMoveSan,
          classification: m.classification,
          severity,
          eval_before_cp: Math.round(m.evalBefore),
          eval_after_cp: Math.round(m.evalAfter),
          mate_before: m.mateBefore,
          mate_after: m.mateAfter,
          status: "active",
          next_review_at: nextReviewAt,
          last_attempt_at: nowIso,
          fail_count: ((existingRow.fail_count ?? 0) + 1),
          pass_count: existingRow.pass_count ?? 0,
          review_count: existingRow.review_count ?? 0,
          consecutive_correct_count: 0,
          cp_loss: Math.max(existingCpLoss, Math.round(m.cpLoss)),
        })
        .eq("id", existingRow.id);

      if (!error) {
        summary.updatedCount += 1;
      } else if (process.env.NODE_ENV !== "production") {
        console.warn("[active-mistake-mining] upsert update failed for", m.moveKey, error.message);
      }
    } else {
      const { error } = await supabase
        .from("user_training_items" as any)
        .insert({
          user_id: userId,
          source_type: "app_training",
          source_provider: "blindspots",
          source_game_id: sessionId,
          source_game_url: null,
          ply: null,
          starting_fen: m.decisionFen,
          decision_fen: m.decisionFen,
          actual_move_uci: m.uci,
          actual_move_san: m.san,
          result_fen: m.fenAfterUserMove,
          setup_previous_fen: m.setupPreviousFen,
          setup_played_move_uci: m.setupPlayedMoveUci,
          setup_played_move_san: m.setupPlayedMoveSan,
          move_key: m.moveKey,
          classification: m.classification,
          severity,
          cp_loss: Math.round(m.cpLoss),
          eval_before_cp: Math.round(m.evalBefore),
          eval_after_cp: Math.round(m.evalAfter),
          mate_before: m.mateBefore,
          mate_after: m.mateAfter,
          status: "active",
          next_review_at: nextReviewAt,
          last_attempt_at: nowIso,
          fail_count: 1,
          pass_count: 0,
          review_count: 0,
          consecutive_correct_count: 0,
          theme_tags: [] as unknown as Json,
        });

      if (!error) {
        summary.insertedCount += 1;
      } else if (process.env.NODE_ENV !== "production") {
        console.warn("[active-mistake-mining] upsert insert failed for", m.moveKey, error.message);
      }
    }
  }

  return summary;
}

/**
 * Mine failed user moves from a completed training sequence and persist them
 * as active mistakes. Never throws — logging and debug summary on failure.
 */
export async function mineMistakesFromSequence({
  userId,
  sessionId,
  positionEvaluations,
  now,
}: {
  userId: string;
  sessionId: string;
  positionEvaluations: MineableMoveInput[];
  now?: Date;
}): Promise<MiningSummary> {
  const emptySummary: MiningSummary = {
    mineableCount: 0,
    insertedCount: 0,
    updatedCount: 0,
    skippedMissingDecisionFen: 0,
    skippedMissingUci: 0,
    skippedNonFailed: 0,
    missingPreludeCount: 0,
  };

  if (!positionEvaluations || positionEvaluations.length === 0) return emptySummary;

  let missedDecisionFen = 0;
  let missedUci = 0;
  let nonFailed = 0;

  for (const row of positionEvaluations) {
    if (!row.decisionFen) { missedDecisionFen++; continue; }
    if (!row.uci) { missedUci++; continue; }
    if (!isMineableUserMistake(row.classification)) { nonFailed++; }
  }

  try {
    const mineable = extractMineableMistakesFromSequence(positionEvaluations);
    const result = await upsertMinedActiveMistakes(mineable, userId, sessionId, now);

    result.skippedMissingDecisionFen = missedDecisionFen;
    result.skippedMissingUci = missedUci;
    result.skippedNonFailed = nonFailed;

    if (process.env.NODE_ENV !== "production") {
      console.log("[active-mistake-mining]", result);
    }

    return result;
  } catch (err: unknown) {
    console.error("[active-mistake-mining] mining failed", err);
    return {
      ...emptySummary,
      skippedMissingDecisionFen: missedDecisionFen,
      skippedMissingUci: missedUci,
      skippedNonFailed: nonFailed,
    };
  }
}



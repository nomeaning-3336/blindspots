import "server-only";

import { buildDashboardSummary, type DashboardSummary } from "@/lib/dashboard";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const RECENT_SESSION_LIMIT = 20;
const MISTAKE_LIMIT = 200;

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const supabase = await getSupabaseServerClient();

  const [profileResult, sessionsResult, mistakesResult, notesResult] = await Promise.all([
    supabase
      .from("user_blindspot_profile")
      .select(
        "total_sequences,blindspots_elo,last_session_at,exploit_queue,explore_queue,revisit_queue,mastered_queue,cluster_stats,daily_target_level,daily_target_positions,mistake_capture_threshold_level,mistake_capture_threshold_cp",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("training_sessions")
      .select("id,completed_at,started_at,sequence_length,elo_delta,elo_after,starting_fen,training_outcome,average_cp_loss,position_evaluations")
      .eq("user_id", userId)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(RECENT_SESSION_LIMIT),
    supabase
      .from("user_mistakes")
      .select(
        "id,source_type,starting_fen,status,opening_name,review_count,pass_count,acceptable_count,fail_count,last_attempt_at,next_review_at,cp_loss,served_count,setup_previous_fen,setup_played_move_uci,eval_before_cp,consecutive_correct_count,move_key",
      )
      .eq("user_id", userId)
      .order("last_attempt_at", { ascending: false, nullsFirst: false })
      .order("first_ingested_at", { ascending: false })
      .limit(MISTAKE_LIMIT),
    supabase
      .from("training_move_notes")
      .select("move_key,decision_fen,note_text,classification,eval_before_cp,eval_after_cp,move_san,move_uci")
      .eq("user_id", userId)
      .order("last_attempted_at", { ascending: false }),
  ]);

  if (profileResult.error) {
    throw new Error(`Failed to load dashboard profile: ${profileResult.error.message}`);
  }

  if (sessionsResult.error) {
    throw new Error(`Failed to load dashboard sessions: ${sessionsResult.error.message}`);
  }

  if (mistakesResult.error) {
    throw new Error(`Failed to load dashboard positions: ${mistakesResult.error.message}`);
  }

  if (notesResult.error) {
    throw new Error(`Failed to load move notes: ${notesResult.error.message}`);
  }

  const mistakes = (mistakesResult.data ?? []) as unknown as Array<{
    id: string;
    source_type: string;
    starting_fen: string;
    status: string;
    opening_name: string | null;
    review_count: number;
    pass_count: number;
    acceptable_count: number;
    fail_count: number;
    last_attempt_at: string | null;
    next_review_at: string | null;
    cp_loss: number | null;
    served_count: number;
    setup_previous_fen: string | null;
    setup_played_move_uci: string | null;
    eval_before_cp: number | null;
    consecutive_correct_count: number;
    move_key: string | null;
  }>;

  const notes = (notesResult.data ?? []) as unknown as Array<{
    move_key: string;
    decision_fen: string | null;
    note_text: string;
    classification: string | null;
    eval_before_cp: number | null;
    eval_after_cp: number | null;
    move_san: string | null;
    move_uci: string | null;
  }>;
  const attemptedMistakes = mistakes.filter((m) => m.cp_loss != null);
  const avgCpLoss =
    attemptedMistakes.length > 0
      ? attemptedMistakes.reduce((sum, m) => sum + (m.cp_loss ?? 0), 0) / attemptedMistakes.length
      : null;

  // Count today's completed sessions for daily goal
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const { count: completedToday, error: todayError } = await supabase
    .from("training_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("completed_at", "is", null)
    .gte("completed_at", todayStart.toISOString())
    .lt("completed_at", tomorrowStart.toISOString());

  if (todayError && process.env.NODE_ENV !== "production") {
    console.warn("[dashboard] Failed to count today's sessions:", todayError.message);
  }

  return buildDashboardSummary({
    profile: profileResult.data as unknown as Record<string, unknown> | null,
    sessions: sessionsResult.data ?? [],
    mistakes,
    avgCpLoss,
    notes,
    completedToday: completedToday ?? 0,
  });
}

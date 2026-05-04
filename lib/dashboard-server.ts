import "server-only";

import { buildDashboardSummary, type DashboardSummary } from "@/lib/dashboard";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const RECENT_SESSION_LIMIT = 20;
const MISTAKE_LIMIT = 200;

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const supabase = await getSupabaseServerClient();

  const [profileResult, sessionsResult, mistakesResult] = await Promise.all([
    supabase
      .from("user_blindspot_profile")
      .select(
        "total_sequences,blindspots_elo,last_session_at,exploit_queue,explore_queue,revisit_queue,mastered_queue,cluster_stats",
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
        "id,source_type,starting_fen,status,opening_name,review_count,pass_count,acceptable_count,fail_count,last_attempt_at,next_review_at,cp_loss,served_count",
      )
      .eq("user_id", userId)
      .order("last_attempt_at", { ascending: false, nullsFirst: false })
      .order("first_ingested_at", { ascending: false })
      .limit(MISTAKE_LIMIT),
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

  const mistakes = mistakesResult.data ?? [];
  const attemptedMistakes = mistakes.filter((m) => m.cp_loss != null);
  const avgCpLoss =
    attemptedMistakes.length > 0
      ? attemptedMistakes.reduce((sum, m) => sum + (m.cp_loss ?? 0), 0) / attemptedMistakes.length
      : null;

  return buildDashboardSummary({
    profile: profileResult.data,
    sessions: sessionsResult.data ?? [],
    mistakes,
    avgCpLoss,
  });
}

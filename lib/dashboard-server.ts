import "server-only";

import { buildDashboardSummary, type DashboardSummary } from "@/lib/dashboard";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const RECENT_SESSION_LIMIT = 20;

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const supabase = await getSupabaseServerClient();

  const [profileResult, sessionsResult] = await Promise.all([
    supabase
      .from("user_blindspot_profile")
      .select(
        "total_sequences,blindspots_elo,last_session_at,exploit_queue,explore_queue,revisit_queue,mastered_queue,cluster_stats",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("training_sessions")
      .select("id,completed_at,started_at,sequence_length,elo_delta,position_evaluations")
      .eq("user_id", userId)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(RECENT_SESSION_LIMIT),
  ]);

  if (profileResult.error) {
    throw new Error(`Failed to load dashboard profile: ${profileResult.error.message}`);
  }

  if (sessionsResult.error) {
    throw new Error(`Failed to load dashboard sessions: ${sessionsResult.error.message}`);
  }

  return buildDashboardSummary({
    profile: profileResult.data,
    sessions: sessionsResult.data ?? [],
  });
}

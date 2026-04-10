import { auth } from "@clerk/nextjs/server";
import type { AnalyzePreferences } from "@/lib/analyze-preferences";
import { normalizeAnalyzePreferences } from "@/lib/analyze-preferences";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export async function getAnalyzePreferences() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  return getAnalyzePreferencesForUser(userId);
}

export async function getAnalyzePreferencesForUser(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_analyze_preferences")
    .select(
      "user_id, limit_kind, time_limit_value, depth_limit_value, lines_shown, threads, board_theme, piece_theme",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load analyze preferences from Supabase", error);
    return null;
  }

  if (!data) {
    return null;
  }

  return normalizeAnalyzePreferences({
    limitKind: data.limit_kind,
    timeLimitValue: data.time_limit_value,
    depthLimitValue: data.depth_limit_value,
    linesShown: data.lines_shown,
    threads: data.threads,
    boardTheme: data.board_theme,
    pieceTheme: data.piece_theme,
  });
}

export async function upsertAnalyzePreferencesForUser(
  userId: string,
  preferences: AnalyzePreferences,
) {
  const supabase = getSupabaseAdminClient();
  const normalized = normalizeAnalyzePreferences(preferences);
  const { error } = await supabase.from("user_analyze_preferences").upsert(
    {
      user_id: userId,
      limit_kind: normalized.limitKind,
      time_limit_value: normalized.timeLimitValue,
      depth_limit_value: normalized.depthLimitValue,
      lines_shown: normalized.linesShown,
      threads: normalized.threads,
      board_theme: normalized.boardTheme,
      piece_theme: normalized.pieceTheme,
    },
    {
      onConflict: "user_id",
    },
  );

  if (error) {
    throw new Error(`Failed to save analyze preferences: ${error.message}`);
  }
}

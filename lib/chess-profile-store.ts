import type {
  LinkedChessProfile,
  PerformancePreferences,
} from "@/lib/chess-profile";
import {
  isPerformanceGameType,
  isPerformanceRangeDays,
  normalizeChessProvider,
} from "@/lib/chess-profile";
import { getOptionalAppUserId } from "@/lib/app-auth";
import type { Database } from "@/lib/supabase/database";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type LinkedChessProfileRow =
  Database["public"]["Tables"]["linked_chess_profiles"]["Row"];

export interface LinkedChessProfileRecord extends LinkedChessProfile {
  performancePreferences: PerformancePreferences | null;
}

export async function getLinkedChessProfile() {
  const userId = await getOptionalAppUserId();

  if (!userId) {
    return null;
  }

  return getLinkedChessProfileForUser(userId);
}

export async function getLinkedChessProfileForUser(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("linked_chess_profiles")
    .select(
      "user_id, provider, username, linked_at, preferred_performance_range_days, preferred_performance_game_type",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load linked chess profile from Supabase", error);
    return null;
  }

  if (!data) {
    return null;
  }

  const provider = normalizeChessProvider(data.provider);

  if (!provider) {
    return null;
  }

  const performancePreferences =
    isPerformanceRangeDays(data.preferred_performance_range_days) &&
    isPerformanceGameType(data.preferred_performance_game_type)
      ? {
          rangeDays: data.preferred_performance_range_days,
          gameType: data.preferred_performance_game_type,
        }
      : null;

  return {
    provider,
    username: data.username,
    linkedAt: data.linked_at,
    performancePreferences,
  } satisfies LinkedChessProfileRecord;
}

export async function upsertLinkedChessProfileForUser(
  userId: string,
  profile: LinkedChessProfile,
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("linked_chess_profiles").upsert(
    {
      user_id: userId,
      provider: profile.provider,
      username: profile.username,
      linked_at: profile.linkedAt,
    },
    {
      onConflict: "user_id",
    },
  );

  if (error) {
    throw new Error(`Failed to save linked chess profile: ${error.message}`);
  }
}

export async function updatePerformancePreferencesForUser(
  userId: string,
  preferences: PerformancePreferences,
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("linked_chess_profiles")
    .update({
      preferred_performance_range_days: preferences.rangeDays,
      preferred_performance_game_type: preferences.gameType,
    })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to save performance preferences: ${error.message}`);
  }
}

export async function deleteLinkedChessProfileForUser(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("linked_chess_profiles")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to remove linked chess profile: ${error.message}`);
  }
}

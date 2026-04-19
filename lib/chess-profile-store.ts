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

function mapLinkedChessProfileRow(data: LinkedChessProfileRow) {
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

export async function getLinkedChessProfiles() {
  const userId = await getOptionalAppUserId();

  if (!userId) {
    return [];
  }

  return getLinkedChessProfilesForUser(userId);
}

export async function getLinkedChessProfile() {
  const profiles = await getLinkedChessProfiles();
  return profiles[0] ?? null;
}

export async function getLinkedChessProfilesForUser(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("linked_chess_profiles")
    .select(
      "user_id, provider, username, linked_at, preferred_performance_range_days, preferred_performance_game_type",
    )
    .eq("user_id", userId)
    .order("linked_at", { ascending: false });

  if (error) {
    console.error("Failed to load linked chess profiles from Supabase", error);
    return [];
  }

  return (data ?? [])
    .map((row) => mapLinkedChessProfileRow(row as LinkedChessProfileRow))
    .filter((row): row is LinkedChessProfileRecord => Boolean(row));
}

export async function getLinkedChessProfileForUser(userId: string) {
  const profiles = await getLinkedChessProfilesForUser(userId);
  return profiles[0] ?? null;
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
      onConflict: "user_id,provider,username",
    },
  );

  if (error) {
    if (
      error.message.includes(
        "no unique or exclusion constraint matching the ON CONFLICT specification",
      )
    ) {
      throw new Error("linked-chess-profile-schema-outdated");
    }

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

export async function deleteLinkedChessProfileForUser(
  userId: string,
  profile: Pick<LinkedChessProfile, "provider" | "username">,
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("linked_chess_profiles")
    .delete()
    .eq("user_id", userId)
    .eq("provider", profile.provider)
    .eq("username", profile.username);

  if (error) {
    throw new Error(`Failed to remove linked chess profile: ${error.message}`);
  }
}

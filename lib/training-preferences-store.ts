import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type TrainingPreferences = {
  sequenceLength: number;
};

const DEFAULT_SEQUENCE_LENGTH = 4;
const MIN_SEQUENCE_LENGTH = 1;
const MAX_SEQUENCE_LENGTH = 9;

export async function getTrainingPreferences() {
  const userId = await getOptionalAppUserId();
  if (!userId) return null;
  return getTrainingPreferencesForUser(userId);
}

export async function getTrainingPreferencesForUser(userId: string): Promise<TrainingPreferences> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_training_preferences")
    .select("sequence_length")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load training preferences from Supabase", error);
    return { sequenceLength: DEFAULT_SEQUENCE_LENGTH };
  }

  return {
    sequenceLength: normalizeSequenceLength(data?.sequence_length),
  };
}

function normalizeSequenceLength(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SEQUENCE_LENGTH;
  return Math.max(MIN_SEQUENCE_LENGTH, Math.min(MAX_SEQUENCE_LENGTH, Math.round(parsed)));
}

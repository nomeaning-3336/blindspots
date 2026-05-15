import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type OnboardingState = {
  trainingTourCompleted: boolean;
  trainingTourCompletedAt: string | null;
};

export async function getOnboardingState(): Promise<OnboardingState> {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return { trainingTourCompleted: false, trainingTourCompletedAt: null };
  }
  return getOnboardingStateForUser(userId);
}

export async function getOnboardingStateForUser(userId: string): Promise<OnboardingState> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_onboarding_state")
    .select("training_onboarding_completed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load onboarding state from Supabase", error);
    return { trainingTourCompleted: false, trainingTourCompletedAt: null };
  }

  return {
    trainingTourCompleted: Boolean(data?.training_onboarding_completed_at),
    trainingTourCompletedAt: data?.training_onboarding_completed_at ?? null,
  };
}

export async function completeOnboardingForUser(userId: string): Promise<OnboardingState> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await (supabase
    .from("user_onboarding_state") as any)
    .upsert(
      { user_id: userId, training_onboarding_completed_at: now, training_tour_checkpoint: null },
      { onConflict: "user_id" },
    )
    .select("training_onboarding_completed_at")
    .single();

  if (error) {
    console.error("Failed to upsert onboarding state", error);
    return { trainingTourCompleted: false, trainingTourCompletedAt: null };
  }

  return {
    trainingTourCompleted: Boolean(data.training_onboarding_completed_at),
    trainingTourCompletedAt: data.training_onboarding_completed_at,
  };
}
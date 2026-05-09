import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type OnboardingState = {
  trainingOnboardingCompleted: boolean;
  trainingOnboardingCompletedAt: string | null;
};

export async function getOnboardingState(): Promise<OnboardingState> {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return { trainingOnboardingCompleted: false, trainingOnboardingCompletedAt: null };
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
    return { trainingOnboardingCompleted: false, trainingOnboardingCompletedAt: null };
  }

  return {
    trainingOnboardingCompleted: data?.training_onboarding_completed_at !== null,
    trainingOnboardingCompletedAt: data?.training_onboarding_completed_at ?? null,
  };
}

export async function completeOnboardingForUser(userId: string): Promise<OnboardingState> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("user_onboarding_state")
    .upsert(
      { user_id: userId, training_onboarding_completed_at: now },
      { onConflict: "user_id" },
    )
    .select("training_onboarding_completed_at")
    .single();

  if (error) {
    console.error("Failed to upsert onboarding state", error);
    return { trainingOnboardingCompleted: false, trainingOnboardingCompletedAt: null };
  }

  return {
    trainingOnboardingCompleted: data.training_onboarding_completed_at !== null,
    trainingOnboardingCompletedAt: data.training_onboarding_completed_at,
  };
}
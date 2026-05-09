import { requireAppAuth } from "@/lib/app-auth";
import { getOnboardingStateForUser } from "@/lib/onboarding-state";
import TrainPage from "./train-client";

export default async function TrainPageWrapper() {
  const userId = await requireAppAuth("/train");
  const state = await getOnboardingStateForUser(userId);
  const initialOnboarding = !state.trainingOnboardingCompleted;
  return <TrainPage initialOnboarding={initialOnboarding} />;
}

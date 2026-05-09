import { requireAppAuth } from "@/lib/app-auth";
import { getOnboardingStateForUser } from "@/lib/onboarding-state";
import TrainPage from "./train-client";

export default async function TrainPageWrapper({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const params = await searchParams;
  const forceOnboarding = params?.onboarding === "1";
  const userId = await requireAppAuth("/train");
  const state = await getOnboardingStateForUser(userId);
  const initialOnboarding = !state.trainingOnboardingCompleted;
  return (
    <TrainPage
      initialOnboarding={initialOnboarding}
      forceOnboarding={forceOnboarding}
    />
  );
}

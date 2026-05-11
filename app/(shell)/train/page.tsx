import { getOptionalAppUserId, requireAppAuth } from "@/lib/app-auth";
import { getOnboardingStateForUser } from "@/lib/onboarding-state";
import TrainPage from "./train-client";

export default async function TrainPageWrapper({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string; debugFEN?: string; debugFen?: string; mistakeId?: string }>;
}) {
  const params = await searchParams;
  const forceOnboarding = params?.onboarding === "1";
  const isDebugRequest = Boolean(params?.debugFEN ?? params?.debugFen);
  const initialMistakeId = typeof params?.mistakeId === "string" ? params.mistakeId : undefined;

  // Allow unauthenticated debug access in dev
  if (isDebugRequest && process.env.NODE_ENV !== "production") {
    const userId = (await getOptionalAppUserId()) ?? "debug-user";
    return (
      <TrainPage
        initialOnboarding={false}
        forceOnboarding={false}
        initialMistakeId={initialMistakeId}
      />
    );
  }

  const userId = await requireAppAuth("/train");
  const state = await getOnboardingStateForUser(userId);
  const initialOnboarding = !state.trainingOnboardingCompleted;
  return (
    <TrainPage
      initialOnboarding={initialOnboarding}
      forceOnboarding={forceOnboarding}
      initialMistakeId={initialMistakeId}
    />
  );
}

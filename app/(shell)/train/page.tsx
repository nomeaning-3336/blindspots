import { getOptionalAppUserId, requireAppAuth } from "@/lib/app-auth";
import { getOnboardingStateForUser } from "@/lib/onboarding-state";
import TrainPage from "./train-client";

export default async function TrainPageWrapper({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string; debugFEN?: string; debugFen?: string; positionId?: string; mistakeId?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const forceOnboarding = params?.onboarding === "1";
  const isDebugRequest = Boolean(params?.debugFEN ?? params?.debugFen);
  const initialMode = params?.mode === "postmortem" ? "postmortem" : "play";
  const initialMistakeId =
    typeof params?.positionId === "string"
      ? params.positionId
      : typeof params?.mistakeId === "string"
        ? params.mistakeId
        : undefined;

  // Allow unauthenticated debug access in dev
  if (isDebugRequest && process.env.NODE_ENV !== "production") {
    const userId = (await getOptionalAppUserId()) ?? "debug-user";
    return (
      <TrainPage
        initialOnboarding={false}
        forceOnboarding={false}
        initialMistakeId={initialMistakeId}
        initialMode={initialMode}
      />
    );
  }

  const userId = await requireAppAuth("/train");
  const state = await getOnboardingStateForUser(userId);
  const shouldRunTrainingTour = !state.trainingTourCompleted;
  return (
    <TrainPage
      initialOnboarding={shouldRunTrainingTour}
      forceOnboarding={forceOnboarding}
      initialMistakeId={initialMistakeId}
      initialMode={initialMode}
    />
  );
}

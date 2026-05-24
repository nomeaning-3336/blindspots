import { getOptionalAppUserId, requireAppAuth } from "@/lib/app-auth";
import { getDashboardSummary } from "@/lib/dashboard-server";
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
    const summary = userId === "debug-user" ? undefined : await getDashboardSummary(userId);
    return (
      <TrainPage
        initialOnboarding={false}
        forceOnboarding={false}
        initialTrainingTourCheckpoint={null}
        initialMistakeId={initialMistakeId}
        initialMode={initialMode}
        dashboardSummary={summary}
      />
    );
  }

  const userId = await requireAppAuth("/train");
  const state = await getOnboardingStateForUser(userId);
  const summary = await getDashboardSummary(userId);
  const shouldRunTrainingTour = !state.trainingTourCompleted;
  return (
    <TrainPage
      initialOnboarding={shouldRunTrainingTour}
      forceOnboarding={forceOnboarding}
      initialTrainingTourCheckpoint={state.trainingTourCheckpoint}
      initialMistakeId={initialMistakeId}
      initialMode={initialMode}
      dashboardSummary={summary}
    />
  );
}

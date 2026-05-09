import { requireAppAuth } from "@/lib/app-auth";
import { redirect } from "next/navigation";
import { getOnboardingState } from "@/lib/onboarding-state";
import OnboardingClient from "./onboarding-client";

export default async function OnboardingPage() {
  const userId = await requireAppAuth("/onboarding");

  const state = await getOnboardingState();

  // If already completed, allow viewing but don't require redirect
  // The client will show a "Start training" button

  return <OnboardingClient userId={userId} initialState={state} />;
}
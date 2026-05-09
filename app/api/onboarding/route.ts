import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getOnboardingStateForUser } from "@/lib/onboarding-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getOnboardingStateForUser(userId);
  return NextResponse.json(state);
}
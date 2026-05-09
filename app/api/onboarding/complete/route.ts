import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { completeOnboardingForUser } from "@/lib/onboarding-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await completeOnboardingForUser(userId);
  return NextResponse.json({ ok: true, ...state });
}
import { NextResponse } from "next/server";
import { normalizeNextPath } from "@/lib/app-auth";
import { getOnboardingStateForUser } from "@/lib/onboarding-state";
import { publicUrl } from "@/lib/public-origin";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

function redirectToSignIn(request: Request, nextPath: string) {
  return NextResponse.redirect(
    publicUrl(
      request,
      `/sign-in?next=${encodeURIComponent(nextPath)}&error=auth-callback`,
    ),
    303,
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const nextPath = normalizeNextPath(url.searchParams.get("next"));

  if (!tokenHash) {
    return redirectToSignIn(request, nextPath);
  }

  const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });

  if (error) {
    return applyCookies(redirectToSignIn(request, nextPath)) as NextResponse;
  }

  let redirectPath = nextPath;
  const userId = data.user?.id;
  if (userId) {
    const onboarding = await getOnboardingStateForUser(userId);
    if (!onboarding.trainingTourCompleted) {
      redirectPath = "/";
    }
  }

  return applyCookies(
    NextResponse.redirect(publicUrl(request, redirectPath), 303),
  ) as NextResponse;
}

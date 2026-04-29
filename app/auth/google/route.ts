import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { normalizeNextPath } from "@/lib/app-auth";

function redirectWithError(request: Request, nextPath: string) {
  return NextResponse.redirect(
    new URL(
      `/sign-in?next=${encodeURIComponent(nextPath)}&error=oauth-failed`,
      request.url,
    ),
    303,
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextPath = normalizeNextPath(url.searchParams.get("next"));
  const callbackUrl = new URL("/auth/callback", request.url);
  callbackUrl.searchParams.set("next", nextPath);

  const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();

  let data;
  let error;

  try {
    const result = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
        queryParams: {
          prompt: "select_account",
        },
      },
    });
    data = result.data;
    error = result.error;
  } catch (e) {
    error = e as Error;
  }

  if (process.env.NODE_ENV !== "production") {
    if (error || !data?.url) {
      console.warn("[auth] Google OAuth failed to start", error);
    }
  }

  if (error || !data?.url) {
    return redirectWithError(request, nextPath);
  }

  return applyCookies(NextResponse.redirect(data.url, 303));
}

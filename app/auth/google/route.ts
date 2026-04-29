import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { normalizeNextPath } from "@/lib/app-auth";

function isSupabaseSessionCookie(name: string) {
  return /^sb-.*-auth-token(?:\.\d+)?$/.test(name);
}

function isSupabaseCodeVerifierCookie(name: string) {
  return /^sb-.*-auth-token-code-verifier$/.test(name);
}

function getCookieNamesFromHeader(cookieHeader: string | null) {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter(Boolean);
}

function clearAllSupabaseAuthFlowCookies(request: Request, response: NextResponse) {
  const cookieHeader = request.headers.get("cookie");
  const cookieNames = getCookieNamesFromHeader(cookieHeader);

  for (const name of cookieNames) {
    if (isSupabaseSessionCookie(name) || isSupabaseCodeVerifierCookie(name)) {
      // Use Max-Age=0 to immediately expire the cookie in the browser's jar.
      response.headers.append(
        "Set-Cookie",
        `${name}=; Path=/; Max-Age=0; SameSite=Lax`,
      );
    }
  }

  return response;
}

function clearStaleSupabaseSessionCookies(request: Request, response: NextResponse) {
  const cookieHeader = request.headers.get("cookie");
  const cookieNames = getCookieNamesFromHeader(cookieHeader);

  for (const name of cookieNames) {
    if (isSupabaseSessionCookie(name)) {
      response.headers.append(
        "Set-Cookie",
        `${name}=; Path=/; Max-Age=0; SameSite=Lax`,
      );
    }
  }

  return response;
}

function redirectWithError(request: Request, nextPath: string) {
  const response = NextResponse.redirect(
    new URL(
      `/sign-in?next=${encodeURIComponent(nextPath)}&error=oauth-failed`,
      request.url,
    ),
    303,
  );

  return clearAllSupabaseAuthFlowCookies(request, response);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextPath = normalizeNextPath(url.searchParams.get("next"));
  const callbackUrl = new URL("/auth/callback", request.url);
  callbackUrl.searchParams.set("next", nextPath);

  const clean = url.searchParams.get("clean") === "1";
  const cookieNames = getCookieNamesFromHeader(request.headers.get("cookie"));
  const hasExistingSessionCookies = cookieNames.some(isSupabaseSessionCookie);
  const hasExistingCodeVerifier = cookieNames.some(isSupabaseCodeVerifierCookie);

  if (!clean && (hasExistingSessionCookies || hasExistingCodeVerifier)) {
    const cleanUrl = new URL("/auth/google", request.url);
    cleanUrl.searchParams.set("next", nextPath);
    cleanUrl.searchParams.set("clean", "1");

    const response = NextResponse.redirect(cleanUrl, 303);
    return clearAllSupabaseAuthFlowCookies(request, response);
  }

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

  const response = applyCookies(NextResponse.redirect(data.url, 303)) as NextResponse;
  return clearStaleSupabaseSessionCookies(request, response);
}

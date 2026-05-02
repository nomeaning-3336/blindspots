import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { normalizeNextPath } from "@/lib/app-auth";
import { publicUrl } from "@/lib/public-origin";
import {
  SUPABASE_AUTH_COOKIE_DELETE_PATHS,
  isSupabaseAuthFlowCookie,
  isSupabaseCodeVerifierCookie,
  isSupabaseSessionCookie,
} from "@/lib/supabase/auth-cookies";

function getCookieNamesFromHeader(cookieHeader: string | null) {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter(Boolean);
}

function appendExpiredCookie(response: NextResponse, name: string, path: string) {
  response.headers.append(
    "Set-Cookie",
    `${name}=; Path=${path}; Max-Age=0; SameSite=Lax`,
  );
}

function clearAllSupabaseAuthFlowCookies(request: Request, response: NextResponse) {
  const cookieHeader = request.headers.get("cookie");
  const cookieNames = getCookieNamesFromHeader(cookieHeader);

  for (const name of cookieNames) {
    if (isSupabaseAuthFlowCookie(name)) {
      for (const path of SUPABASE_AUTH_COOKIE_DELETE_PATHS) {
        appendExpiredCookie(response, name, path);
      }
    }
  }

  return response;
}

function clearStaleSupabaseSessionCookies(request: Request, response: NextResponse) {
  const cookieHeader = request.headers.get("cookie");
  const cookieNames = getCookieNamesFromHeader(cookieHeader);

  for (const name of cookieNames) {
    if (isSupabaseSessionCookie(name)) {
      for (const path of SUPABASE_AUTH_COOKIE_DELETE_PATHS) {
        appendExpiredCookie(response, name, path);
      }
    }
  }

  return response;
}

function redirectWithError(request: Request, nextPath: string) {
  const response = NextResponse.redirect(
    publicUrl(
      request,
      `/sign-in?next=${encodeURIComponent(nextPath)}&error=oauth-failed`,
    ),
    303,
  );

  return clearAllSupabaseAuthFlowCookies(request, response);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextPath = normalizeNextPath(url.searchParams.get("next"));
  const callbackUrl = publicUrl(request, "/auth/callback");
  callbackUrl.searchParams.set("next", nextPath);

  const clean = url.searchParams.get("clean") === "1";
  const cookieNames = getCookieNamesFromHeader(request.headers.get("cookie"));
  const hasExistingSessionCookies = cookieNames.some(isSupabaseSessionCookie);
  const hasExistingCodeVerifier = cookieNames.some(isSupabaseCodeVerifierCookie);

  if (!clean && (hasExistingSessionCookies || hasExistingCodeVerifier)) {
    const cleanUrl = publicUrl(request, "/auth/google");
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

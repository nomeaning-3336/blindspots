import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { normalizeNextPath } from "@/lib/app-auth";
import {
  SUPABASE_AUTH_COOKIE_DELETE_PATHS,
  isSupabaseAuthFlowCookie,
} from "@/lib/supabase/auth-cookies";

function getCookieNamesFromHeader(cookieHeader: string | null) {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter(Boolean);
}

function clearSupabaseAuthFlowCookies(request: Request, response: NextResponse) {
  const cookieNames = getCookieNamesFromHeader(request.headers.get("cookie"));

  for (const name of cookieNames) {
    if (isSupabaseAuthFlowCookie(name)) {
      for (const path of SUPABASE_AUTH_COOKIE_DELETE_PATHS) {
        response.headers.append(
          "Set-Cookie",
          `${name}=; Path=${path}; Max-Age=0; SameSite=Lax`,
        );
      }
    }
  }

  return response;
}

function redirectToSignIn(request: Request, nextPath: string) {
  return NextResponse.redirect(
    new URL(
      `/sign-in?next=${encodeURIComponent(nextPath)}&error=auth-callback`,
      request.url,
    ),
    303,
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = normalizeNextPath(url.searchParams.get("next"));
  const providerError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (providerError || !code) {
    return clearSupabaseAuthFlowCookies(
      request,
      redirectToSignIn(request, nextPath),
    );
  }

  const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return clearSupabaseAuthFlowCookies(
      request,
      applyCookies(redirectToSignIn(request, nextPath)) as NextResponse,
    );
  }

  return applyCookies(
    NextResponse.redirect(new URL(nextPath, request.url), 303),
  );
}

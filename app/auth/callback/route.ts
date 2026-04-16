import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { normalizeNextPath } from "@/lib/app-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = normalizeNextPath(url.searchParams.get("next"));
  const providerError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (providerError || !code) {
    return NextResponse.redirect(
      new URL(
        `/sign-in?next=${encodeURIComponent(nextPath)}&error=auth-callback`,
        request.url,
      ),
      303,
    );
  }

  const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/sign-in?next=${encodeURIComponent(nextPath)}&error=auth-callback`,
        request.url,
      ),
      303,
    );
  }

  return applyCookies(
    NextResponse.redirect(new URL(nextPath, request.url), 303),
  );
}

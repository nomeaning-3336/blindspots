import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { normalizeNextPath } from "@/lib/app-auth";
import {
  buildMagicLinkCallbackUrl,
  buildMagicLinkSentUrl,
} from "@/lib/auth-magic-link";
import { publicUrl } from "@/lib/public-origin";

function getFormValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWithQuery(
  request: Request,
  pathname: string,
  nextPath: string,
  params: Record<string, string>,
) {
  const url = publicUrl(request, pathname);
  url.searchParams.set("next", nextPath);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const nextPath = normalizeNextPath(getFormValue(formData, "next"));
  const email = getFormValue(formData, "email").toLowerCase();

  if (!email) {
    return redirectWithQuery(request, "/auth/email", nextPath, {
      error: "missing-email",
    });
  }
  const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();

  let error;
  try {
    const result = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: buildMagicLinkCallbackUrl(request, nextPath),
        shouldCreateUser: true,
      },
    });
    error = result.error;
  } catch {
    return redirectWithQuery(request, "/auth/email", nextPath, {
      error: "otp-failed",
      email,
    });
  }

  if (error) {
    return redirectWithQuery(request, "/auth/email", nextPath, {
      error: "otp-failed",
      email,
    });
  }

  return applyCookies(
    NextResponse.redirect(
      buildMagicLinkSentUrl(request, nextPath, email),
      303,
    ),
  );
}

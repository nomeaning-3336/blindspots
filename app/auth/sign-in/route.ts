import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { normalizeNextPath } from "@/lib/app-auth";

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
  const url = new URL(pathname, request.url);
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
  const password = getFormValue(formData, "password");

  if (!email || !password) {
    return redirectWithQuery(request, "/sign-in", nextPath, {
      error: "missing-fields",
      email,
    });
  }

  const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return redirectWithQuery(request, "/sign-in", nextPath, {
      error:
        error.message.toLowerCase().includes("invalid login credentials")
          ? "invalid-credentials"
          : "sign-in-failed",
      email,
    });
  }

  return applyCookies(
    NextResponse.redirect(new URL(nextPath, request.url), 303),
  );
}

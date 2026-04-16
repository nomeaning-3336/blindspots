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
  const confirmPassword = getFormValue(formData, "confirmPassword");

  if (!email || !password || !confirmPassword) {
    return redirectWithQuery(request, "/sign-up", nextPath, {
      error: "missing-fields",
      email,
    });
  }

  if (password.length < 8) {
    return redirectWithQuery(request, "/sign-up", nextPath, {
      error: "weak-password",
      email,
    });
  }

  if (password !== confirmPassword) {
    return redirectWithQuery(request, "/sign-up", nextPath, {
      error: "password-mismatch",
      email,
    });
  }

  const { supabase, applyCookies } = await createSupabaseRouteHandlerClient();
  const emailRedirectTo = new URL("/auth/callback", request.url);
  emailRedirectTo.searchParams.set("next", nextPath);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: emailRedirectTo.toString(),
    },
  });

  if (error) {
    const normalizedMessage = error.message.toLowerCase();

    return redirectWithQuery(request, "/sign-up", nextPath, {
      error:
        normalizedMessage.includes("already registered") ||
        normalizedMessage.includes("already been registered") ||
        normalizedMessage.includes("already exists")
          ? "email-in-use"
          : "sign-up-failed",
      email,
    });
  }

  if (!data.session) {
    return applyCookies(
      redirectWithQuery(request, "/sign-in", nextPath, {
        status: "check-email",
        email,
      }),
    );
  }

  return applyCookies(
    NextResponse.redirect(new URL(nextPath, request.url), 303),
  );
}

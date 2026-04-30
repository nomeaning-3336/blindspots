import "server-only";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  getSupabaseServerClient,
  getSupabaseServerUser,
} from "@/lib/supabase/server";
import { isSupabaseSessionCookie } from "@/lib/supabase/auth-cookies";

export const DEFAULT_APP_ROUTE = "/analysis";

export function normalizeNextPath(value?: string | null) {
  if (!value) return DEFAULT_APP_ROUTE;
  if (value === "/app") return DEFAULT_APP_ROUTE;
  if (value === "/analyze" || value === "/analyze/") return DEFAULT_APP_ROUTE;
  if (value === "/app/analyze" || value === "/app/analyze/") return DEFAULT_APP_ROUTE;
  if (value.startsWith("/app/")) return normalizeNextPath(value.slice(4) || DEFAULT_APP_ROUTE);
  if (
    value === "/dashboard" ||
    value === "/analysis" ||
    value === "/train" ||
    value === "/performance" ||
    value === "/account" ||
    value.startsWith("/dashboard/") ||
    value.startsWith("/analysis/") ||
    value.startsWith("/train/") ||
    value.startsWith("/performance/") ||
    value.startsWith("/account/")
  ) {
    return value;
  }
  if (value.startsWith("/analyze/")) {
    return `/analysis/${value.slice("/analyze/".length)}`;
  }
  return DEFAULT_APP_ROUTE;
}

export async function getShellAuthHint() {
  const cookieStore = await cookies();
  return cookieStore.getAll().some(
    (cookie) => isSupabaseSessionCookie(cookie.name),
  );
}

export type GetVerifiedUserResult =
  | { status: "valid"; userId: string }
  | { status: "invalid_session" | "missing" | "error" };

/**
 * Full Supabase getUser() verification. Used by protected page routes and API
 * routes that need to confirm the auth session is still active and corresponds
 * to a real user.
 */
export async function getVerifiedAppUserId(): Promise<GetVerifiedUserResult> {
  const supabase = await getSupabaseServerClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (process.env.NODE_ENV !== "production") {
    const cookieStore = await cookies();
    const cookieNames = cookieStore
      .getAll()
      .filter((c) => isSupabaseSessionCookie(c.name))
      .map((c) => c.name);
    console.log(
      "[auth:getVerifiedAppUserId] cookies:",
      cookieNames.length > 0 ? cookieNames : "none",
    );
    if (sessionError) {
      console.log("[auth:getVerifiedAppUserId] session error:", sessionError.message);
    }
  }

  if (sessionError) {
    const msg = sessionError.message.toLowerCase();
    const isMissing = msg.includes("auth session missing");
    const isInvalid =
      msg.includes("user not found") ||
      msg.includes("user from sub claim in jwt does not exist") ||
      msg.includes("user does not exist");

    if (isMissing) {
      return { status: "missing" };
    }
    if (isInvalid) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[auth:getVerifiedAppUserId] invalid session — clearing stale cookies");
      }
      try {
        const cookieStore = await cookies();
        for (const cookie of cookieStore.getAll()) {
          if (isSupabaseSessionCookie(cookie.name)) {
            cookieStore.delete(cookie.name);
          }
        }
      } catch { /* cleanup best-effort */ }
      return { status: "invalid_session" };
    }

    console.error("[auth:getVerifiedAppUserId] unexpected session error:", sessionError);
    return { status: "error" };
  }

  if (!sessionData.session) {
    return { status: "missing" };
  }

  // Verify the user still exists in the database
  const userData = await getSupabaseServerUser();

  if (!userData) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[auth:getVerifiedAppUserId] user no longer exists — clearing stale cookies");
    }
    try {
      const cookieStore = await cookies();
      for (const cookie of cookieStore.getAll()) {
        if (isSupabaseSessionCookie(cookie.name)) {
          cookieStore.delete(cookie.name);
        }
      }
    } catch { /* cleanup best-effort */ }
    return { status: "invalid_session" };
  }

  return { status: "valid", userId: userData.id };
}

export async function getOptionalAppUserId() {
  const result = await getVerifiedAppUserId();
  if (result.status === "valid") {
    return result.userId;
  }
  return null;
}

export async function requireAppAuth(nextPath: string) {
  const result = await getVerifiedAppUserId();

  if (result.status !== "valid") {
    if (process.env.NODE_ENV !== "production") {
      console.log("[auth] requireAppAuth redirecting — status:", result.status, "next:", nextPath);
    }
    redirect(`/sign-in?next=${encodeURIComponent(normalizeNextPath(nextPath))}`);
  }

  return result.userId;
}

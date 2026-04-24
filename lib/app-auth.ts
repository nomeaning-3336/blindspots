import { redirect } from "next/navigation";
import { getSupabaseServerUserId } from "@/lib/supabase/server";

export const DEFAULT_APP_ROUTE = "/analysis";

export function normalizeNextPath(value?: string | null) {
  if (!value) return DEFAULT_APP_ROUTE;
  if (value === "/app") return DEFAULT_APP_ROUTE;
  if (value === "/analyze" || value === "/analyze/") return DEFAULT_APP_ROUTE;
  if (value === "/app/analyze" || value === "/app/analyze/") return DEFAULT_APP_ROUTE;
  if (value.startsWith("/app/")) return normalizeNextPath(value.slice(4) || DEFAULT_APP_ROUTE);
  if (
    value === "/analysis" ||
    value === "/train" ||
    value === "/performance" ||
    value === "/account" ||
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

export async function getOptionalAppUserId() {
  return getSupabaseServerUserId();
}

export async function requireAppAuth(nextPath: string) {
  const userId = await getOptionalAppUserId();

  if (!userId) {
    redirect(`/sign-in?next=${encodeURIComponent(normalizeNextPath(nextPath))}`);
  }

  return userId;
}

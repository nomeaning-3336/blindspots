export const DEFAULT_APP_ROUTE = "/";

export function normalizeNextPath(value?: string | null) {
  if (!value) return DEFAULT_APP_ROUTE;
  if (value === "/" || value === "/app") return DEFAULT_APP_ROUTE;
  if (value === "/dashboard" || value.startsWith("/dashboard/")) return DEFAULT_APP_ROUTE;
  if (value === "/analyze" || value === "/analyze/") return "/analysis";
  if (value === "/app/analyze" || value === "/app/analyze/") return "/analysis";
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

import { AnalyzeShell } from "@/components/analyze-shell";
import { getAnalyzePreferences } from "@/lib/analyze-preferences-store";
import { getVerifiedAppUserId } from "@/lib/app-auth";

const ANALYZE_PAGE_FETCH_TIMEOUT_MS = 5000;

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
  } catch {
    return fallback;
  }
}

type AnalyzePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AnalyzePage({ searchParams }: AnalyzePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawFen = resolvedSearchParams.fen;
  const initialFen = Array.isArray(rawFen) ? rawFen[0] : rawFen;

  const userIdResult = await getVerifiedAppUserId();
  const userId = userIdResult.status === "valid" ? userIdResult.userId : null;
  const initialPreferences = await withTimeout(
    getAnalyzePreferences(),
    ANALYZE_PAGE_FETCH_TIMEOUT_MS,
    null,
  );

  return (
    <AnalyzeShell
      initialFen={typeof initialFen === "string" && initialFen.trim().length > 0 ? initialFen : null}
      initialPreferences={initialPreferences}
      analyzePreferencesPersistUrl={userId ? "/api/analyze/preferences" : null}
    />
  );
}

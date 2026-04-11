import { auth } from "@clerk/nextjs/server";
import { AnalyzeShell } from "@/components/analyze-shell";
import { getAnalyzePreferences } from "@/lib/analyze-preferences-store";

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

export default async function AnalyzePage() {
  const { userId } = await auth();
  const initialPreferences = await withTimeout(
    getAnalyzePreferences(),
    ANALYZE_PAGE_FETCH_TIMEOUT_MS,
    null,
  );

  return (
    <AnalyzeShell
      initialPreferences={initialPreferences}
      initialWorkspaceMode="explore"
      analyzePreferencesPersistUrl={userId ? "/api/analyze/preferences" : null}
    />
  );
}

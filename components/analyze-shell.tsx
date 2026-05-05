"use client";

import type { AnalyzePreferences } from "@/lib/analyze-preferences";
import { ChessAppProvider } from "./chess-app-context";
import { AnalyzeBridge } from "./analyze-bridge";

function AnalyzeShellInner({
  initialFen,
  initialPreferences,
  analyzePreferencesPersistUrl,
}: {
  initialFen?: string | null;
  initialPreferences: AnalyzePreferences | null;
  analyzePreferencesPersistUrl?: string | null;
}) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[16px] bg-transparent">
      <div className="relative min-h-0 flex-1">
        <AnalyzeBridge
          initialFen={initialFen}
          initialPreferences={initialPreferences}
          analyzePreferencesPersistUrl={analyzePreferencesPersistUrl}
        />
      </div>
    </div>
  );
}

export function AnalyzeShell({
  initialFen,
  initialPreferences,
  analyzePreferencesPersistUrl,
}: {
  initialFen?: string | null;
  initialPreferences: AnalyzePreferences | null;
  analyzePreferencesPersistUrl?: string | null;
}) {
  return (
    <ChessAppProvider>
      <AnalyzeShellInner
        initialFen={initialFen}
        initialPreferences={initialPreferences}
        analyzePreferencesPersistUrl={analyzePreferencesPersistUrl}
      />
    </ChessAppProvider>
  );
}

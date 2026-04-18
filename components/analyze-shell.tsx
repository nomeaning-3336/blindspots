"use client";

import type { AnalyzePreferences } from "@/lib/analyze-preferences";
import { ChessAppProvider } from "./chess-app-context";
import { AnalyzeBridge } from "./analyze-bridge";

function AnalyzeShellInner({
  initialPreferences,
  analyzePreferencesPersistUrl,
}: {
  initialPreferences: AnalyzePreferences | null;
  analyzePreferencesPersistUrl?: string | null;
}) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[16px] bg-transparent">
      <div className="relative min-h-0 flex-1">
        <AnalyzeBridge
          initialPreferences={initialPreferences}
          analyzePreferencesPersistUrl={analyzePreferencesPersistUrl}
        />
      </div>
    </div>
  );
}

export function AnalyzeShell({
  initialPreferences,
  analyzePreferencesPersistUrl,
}: {
  initialPreferences: AnalyzePreferences | null;
  analyzePreferencesPersistUrl?: string | null;
}) {
  return (
    <ChessAppProvider>
      <AnalyzeShellInner
        initialPreferences={initialPreferences}
        analyzePreferencesPersistUrl={analyzePreferencesPersistUrl}
      />
    </ChessAppProvider>
  );
}

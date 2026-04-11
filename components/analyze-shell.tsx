"use client";

import type { AnalyzePreferences } from "@/lib/analyze-preferences";
import type { ArcadeInitialGameSnapshot } from "@/lib/arcade";
import { ChessAppProvider } from "./chess-app-context";
import { AnalyzeBridge } from "./analyze-bridge";

export type AnalyzeWorkspaceMode = "explore" | "arcade";

function AnalyzeShellInner({
  initialPreferences,
  initialWorkspaceMode,
  layoutMode,
  initialArcadeGame,
  arcadeGamePersistUrl,
  analyzePreferencesPersistUrl,
}: {
  initialPreferences: AnalyzePreferences | null;
  initialWorkspaceMode: AnalyzeWorkspaceMode;
  layoutMode?: "default" | "arcade-play";
  initialArcadeGame?: ArcadeInitialGameSnapshot | null;
  arcadeGamePersistUrl?: string | null;
  analyzePreferencesPersistUrl?: string | null;
}) {
  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden bg-transparent ${
        layoutMode === "arcade-play" ? "" : "rounded-[16px]"
      }`}
    >
      <div className="relative min-h-0 flex-1">
        <AnalyzeBridge
          initialPreferences={initialPreferences}
          initialWorkspaceMode={initialWorkspaceMode}
          layoutMode={layoutMode}
          initialArcadeGame={initialArcadeGame}
          arcadeGamePersistUrl={arcadeGamePersistUrl}
          analyzePreferencesPersistUrl={analyzePreferencesPersistUrl}
        />
      </div>
    </div>
  );
}

export function AnalyzeShell({
  initialPreferences,
  initialWorkspaceMode,
  layoutMode,
  initialArcadeGame,
  arcadeGamePersistUrl,
  analyzePreferencesPersistUrl,
}: {
  initialPreferences: AnalyzePreferences | null;
  initialWorkspaceMode: AnalyzeWorkspaceMode;
  layoutMode?: "default" | "arcade-play";
  initialArcadeGame?: ArcadeInitialGameSnapshot | null;
  arcadeGamePersistUrl?: string | null;
  analyzePreferencesPersistUrl?: string | null;
}) {
  return (
    <ChessAppProvider>
      <AnalyzeShellInner
        initialPreferences={initialPreferences}
        initialWorkspaceMode={initialWorkspaceMode}
        layoutMode={layoutMode}
        initialArcadeGame={initialArcadeGame}
        arcadeGamePersistUrl={arcadeGamePersistUrl}
        analyzePreferencesPersistUrl={analyzePreferencesPersistUrl}
      />
    </ChessAppProvider>
  );
}

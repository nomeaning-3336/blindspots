import { AnalyzeShell } from "@/components/analyze-shell";
import { getAnalyzePreferences } from "@/lib/analyze-preferences-store";
import { getArcadeGameForUser } from "@/lib/arcade-game-store";
import { requireAppAuth } from "@/lib/app-auth";
import { notFound } from "next/navigation";

const ARCADE_GAME_FETCH_TIMEOUT_MS = 5000;

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

export default async function ArcadeGamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const userId = await requireAppAuth(`/arcade/${gameId}`);

  const game = await withTimeout(getArcadeGameForUser(userId, gameId), ARCADE_GAME_FETCH_TIMEOUT_MS, null);
  if (!game) {
    notFound();
  }

  const initialPreferences = await withTimeout(
    getAnalyzePreferences(),
    ARCADE_GAME_FETCH_TIMEOUT_MS,
    null,
  );

  return (
    <section
      className="flex h-full w-full min-h-0 flex-col border-[3px] p-4 md:p-5"
      style={{
        borderColor: "var(--app-text)",
        background: "var(--app-panel-solid)",
        boxShadow: "12px 12px 0 var(--app-shell-shadow)",
      }}
    >
      <div className="mb-4 flex justify-end">
        <a
          href="/arcade"
          className="inline-flex items-center justify-center border-[3px] px-4 py-3 text-xs font-black uppercase transition hover:translate-x-[3px] hover:translate-y-[3px]"
          style={{
            borderColor: "var(--app-text)",
            background: "var(--app-bg)",
            color: "var(--app-text)",
            boxShadow: "8px 8px 0 var(--app-accent)",
          }}
        >
          Back To Arcade
        </a>
      </div>

      <div
        className="min-h-0 flex-1"
        style={{
          minHeight: 0,
        }}
      >
        <AnalyzeShell
          initialPreferences={initialPreferences}
          initialWorkspaceMode="arcade"
          layoutMode="arcade-play"
          initialArcadeGame={{
            gameId: game.id,
            variantKey: game.variantKey,
            state: game.state,
          }}
          arcadeGamePersistUrl={`/api/arcade/games/${game.id}`}
          analyzePreferencesPersistUrl="/api/analyze/preferences"
        />
      </div>
    </section>
  );
}


import { notFound } from "next/navigation";
import { PracticeGameRoom } from "@/components/practice-game-room";
import { getAnalyzePreferences } from "@/lib/analyze-preferences-store";
import { getPracticeGameForUser } from "@/lib/practice-game-store";
import { requireAppAuth } from "@/lib/app-auth";

const PRACTICE_GAME_FETCH_TIMEOUT_MS = 5000;

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

export default async function PracticeGamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const userId = await requireAppAuth(`/practice/${gameId}`);
  const game = await withTimeout(
    getPracticeGameForUser(userId, gameId),
    PRACTICE_GAME_FETCH_TIMEOUT_MS,
    null,
  );
  const analyzePreferences = await withTimeout(
    getAnalyzePreferences(),
    PRACTICE_GAME_FETCH_TIMEOUT_MS,
    null,
  );

  if (!game) {
    notFound();
  }

  return (
    <PracticeGameRoom
      game={game}
      initialBoardTheme={analyzePreferences?.boardTheme}
      initialPieceTheme={analyzePreferences?.pieceTheme}
    />
  );
}

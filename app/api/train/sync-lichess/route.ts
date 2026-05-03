import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { syncLichessMistakesForUser } from "@/lib/training/lichess-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseOptionalNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    // no body — use defaults
  }

  const maxGames = parseOptionalNumber(body.maxGames, 1, 10, 2);
  const maxUserMoves = parseOptionalNumber(body.maxUserMoves, 1, 150, 20);
  const maxMistakes = parseOptionalNumber(body.maxMistakes, 1, 50, 10);
  const sinceDays = parseOptionalNumber(body.sinceDays, 1, 365, 30);

  try {
    const results = await syncLichessMistakesForUser({
      userId,
      maxGames,
      maxUserMoves,
      maxMistakes,
      sinceDays,
    });

    const totalGamesFetched = results.reduce((sum, r) => sum + r.gamesFetched, 0);
    const totalGamesAnalyzed = results.reduce((sum, r) => sum + r.gamesAnalyzed, 0);
    const totalMistakesInserted = results.reduce((sum, r) => sum + r.mistakesInserted, 0);
    const totalMovesAnalyzed = results.reduce((sum, r) => sum + r.movesAnalyzed, 0);
    const totalEvalsAttempted = results.reduce((sum, r) => sum + r.evalsAttempted, 0);
    const totalEvalsSucceeded = results.reduce((sum, r) => sum + r.evalsSucceeded, 0);

    if (results.length === 0) {
      return NextResponse.json({
        ok: true,
        results: [],
        message: "No linked Lichess profile.",
      });
    }

    return NextResponse.json({
      ok: true,
      results,
      totalGamesFetched,
      totalGamesAnalyzed,
      totalMistakesInserted,
      totalMovesAnalyzed,
      totalEvalsAttempted,
      totalEvalsSucceeded,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    console.error("[sync-lichess]", message);
    return NextResponse.json({ error: "Sync failed." }, { status: 500 });
  }
}

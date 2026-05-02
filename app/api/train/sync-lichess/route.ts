import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { syncLichessMistakesForUser } from "@/lib/training/lichess-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await syncLichessMistakesForUser({ userId });

    const totalGamesFetched = results.reduce((sum, r) => sum + r.gamesFetched, 0);
    const totalGamesAnalyzed = results.reduce((sum, r) => sum + r.gamesAnalyzed, 0);
    const totalMistakesInserted = results.reduce((sum, r) => sum + r.mistakesInserted, 0);
    const totalMovesAnalyzed = results.reduce((sum, r) => sum + r.movesAnalyzed, 0);

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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    console.error("[sync-lichess]", message);
    return NextResponse.json({ error: "Sync failed." }, { status: 500 });
  }
}

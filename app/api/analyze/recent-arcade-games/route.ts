import { NextResponse } from "next/server";
import { listRecentStandardArcadeGamesForUser } from "@/lib/arcade-game-store";
import { getOptionalAppUserId } from "@/lib/app-auth";

export async function GET() {
  const userId = await getOptionalAppUserId();
  const headers = { "Cache-Control": "no-store" };

  if (!userId) {
    return NextResponse.json(
      {
        status: "signed-out" as const,
        signInHref: `/sign-in?next=${encodeURIComponent("/analysis")}`,
      },
      { headers },
    );
  }

  try {
    const games = await listRecentStandardArcadeGamesForUser(userId);
    return NextResponse.json(
      {
        status: "ok" as const,
        games,
      },
      { headers },
    );
  } catch (error) {
    console.error("Recent arcade games route failed", error);
    return NextResponse.json(
      {
        status: "error" as const,
        message:
          "Recent Arcade games could not be loaded right now. Try again in a moment.",
      },
      { headers },
    );
  }
}

import { NextResponse } from "next/server";
import { getLinkedChessProfiles } from "@/lib/chess-profile-store";
import { getRecentImportGames } from "@/lib/analyze-recent-games-server";
import { getOptionalAppUserId, normalizeNextPath } from "@/lib/app-auth";

export async function GET() {
  const userId = await getOptionalAppUserId();
  const isSignedIn = Boolean(userId);
  const headers = { "Cache-Control": "no-store" };

  if (!isSignedIn) {
    return NextResponse.json(
      {
        status: "signed-out" as const,
        signInHref: `/sign-in?next=${encodeURIComponent(
          normalizeNextPath("/analysis"),
        )}`,
      },
      { headers },
    );
  }

  const linkedProfiles = await getLinkedChessProfiles();
  if (!linkedProfiles.length) {
    return NextResponse.json(
      {
        status: "missing-profile" as const,
        accountHref: "/account",
      },
      { headers },
    );
  }

  try {
    const games = await getRecentImportGames(linkedProfiles);
    return NextResponse.json(
      {
        status: "ok" as const,
        games,
      },
      { headers },
    );
  } catch (error) {
    console.error("Recent analyze games route failed", error);
    return NextResponse.json(
      {
        status: "error" as const,
        message:
          "Recent games could not be loaded right now. Try again in a moment.",
      },
      { headers },
    );
  }
}

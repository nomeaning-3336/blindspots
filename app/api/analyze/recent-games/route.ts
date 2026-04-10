import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getLinkedChessProfile } from "@/lib/chess-profile-store";
import { getRecentImportGames } from "@/lib/analyze-recent-games-server";
import { getChessProviderLabel } from "@/lib/chess-profile";
import { normalizeNextPath } from "@/lib/app-auth";

export async function GET() {
  const { userId } = await auth();
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

  const linkedProfile = await getLinkedChessProfile();
  if (!linkedProfile) {
    return NextResponse.json(
      {
        status: "missing-profile" as const,
        accountHref: "/account",
      },
      { headers },
    );
  }

  try {
    const games = await getRecentImportGames(linkedProfile);
    return NextResponse.json(
      {
        status: "ok" as const,
        profile: {
          provider: linkedProfile.provider,
          providerLabel: getChessProviderLabel(linkedProfile.provider),
          username: linkedProfile.username,
        },
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

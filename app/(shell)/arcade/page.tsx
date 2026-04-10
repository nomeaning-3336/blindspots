import { auth } from "@clerk/nextjs/server";
import { ArcadeDashboard } from "@/components/arcade-dashboard";
import { listActiveArcadeGamesForUser } from "@/lib/arcade-game-store";

export default async function ArcadePage() {
  let userId: string | null = null;
  try {
    const authRes = await auth();
    userId = authRes.userId ?? null;
  } catch {
    userId = null;
  }

  const activeGames = userId
    ? await listActiveArcadeGamesForUser(userId).catch(() => [])
    : [];

  return (
    <ArcadeDashboard
      canCreate={Boolean(userId)}
      signInHref={`/sign-in?next=${encodeURIComponent("/arcade")}`}
      activeGames={activeGames}
    />
  );
}

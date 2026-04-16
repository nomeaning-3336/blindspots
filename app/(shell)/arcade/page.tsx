import { ArcadeDashboard } from "@/components/arcade-dashboard";
import { listActiveArcadeGamesForUser } from "@/lib/arcade-game-store";
import { getOptionalAppUserId } from "@/lib/app-auth";

export default async function ArcadePage() {
  const userId = await getOptionalAppUserId();

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

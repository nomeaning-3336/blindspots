import { PracticeHome } from "@/components/practice-home";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { listActivePracticeGamesForUser } from "@/lib/practice-game-store";

export default async function PracticePage() {
  const userId = await getOptionalAppUserId();
  const activeGames = userId
    ? await listActivePracticeGamesForUser(userId).catch(() => [])
    : [];

  return (
    <PracticeHome
      canCreate={Boolean(userId)}
      signInHref={`/sign-in?next=${encodeURIComponent("/practice")}`}
      activeGames={activeGames}
    />
  );
}

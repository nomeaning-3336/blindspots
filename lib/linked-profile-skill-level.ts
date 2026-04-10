import type { PerformanceGameType } from "@/lib/chess-profile";
import { getLinkedChessProfileForUser } from "@/lib/chess-profile-store";

interface CachedSkillLevel {
  value: string | null;
  expiresAt: number;
}

interface ChessComStatsResponse {
  chess_bullet?: { last?: { rating?: number } };
  chess_blitz?: { last?: { rating?: number } };
  chess_rapid?: { last?: { rating?: number } };
  chess_daily?: { last?: { rating?: number } };
}

interface LichessUserResponse {
  perfs?: Record<string, { rating?: number } | undefined>;
}

const SKILL_CACHE_TTL_MS = 30 * 60 * 1000;
const skillCache = new Map<string, CachedSkillLevel>();

function gameTypePriority(gameType: PerformanceGameType): PerformanceGameType[] {
  switch (gameType) {
    case "bullet":
      return ["bullet", "blitz", "rapid", "classical", "daily"];
    case "blitz":
      return ["blitz", "rapid", "bullet", "classical", "daily"];
    case "rapid":
      return ["rapid", "blitz", "bullet", "classical", "daily"];
    case "classical":
      return ["classical", "rapid", "blitz", "bullet", "daily"];
    case "daily":
      return ["daily", "rapid", "blitz", "bullet", "classical"];
    case "all":
    default:
      return ["rapid", "blitz", "bullet", "classical", "daily"];
  }
}

function validRating(value: unknown): number | null {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return null;
  if (rating < 100 || rating > 4000) return null;
  return Math.round(rating);
}

function chessComRatingForType(
  data: ChessComStatsResponse,
  gameType: PerformanceGameType,
): number | null {
  if (gameType === "bullet") return validRating(data.chess_bullet?.last?.rating);
  if (gameType === "blitz") return validRating(data.chess_blitz?.last?.rating);
  if (gameType === "rapid" || gameType === "classical") {
    return validRating(data.chess_rapid?.last?.rating);
  }
  if (gameType === "daily") return validRating(data.chess_daily?.last?.rating);
  return null;
}

function lichessPerfKey(gameType: PerformanceGameType): string {
  if (gameType === "daily") return "correspondence";
  if (gameType === "classical") return "classical";
  if (gameType === "bullet" || gameType === "blitz" || gameType === "rapid") return gameType;
  return "rapid";
}

function lichessRatingForType(
  data: LichessUserResponse,
  gameType: PerformanceGameType,
): number | null {
  const key = lichessPerfKey(gameType);
  return validRating(data.perfs?.[key]?.rating);
}

async function fetchChessComRating(
  username: string,
  preferredGameType: PerformanceGameType,
): Promise<{ rating: number; gameType: PerformanceGameType } | null> {
  const response = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/stats`,
    {
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as ChessComStatsResponse;
  for (const gameType of gameTypePriority(preferredGameType)) {
    const rating = chessComRatingForType(data, gameType);
    if (rating !== null) return { rating, gameType };
  }
  return null;
}

async function fetchLichessRating(
  username: string,
  preferredGameType: PerformanceGameType,
): Promise<{ rating: number; gameType: PerformanceGameType } | null> {
  const response = await fetch(
    `https://lichess.org/api/user/${encodeURIComponent(username)}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as LichessUserResponse;
  for (const gameType of gameTypePriority(preferredGameType)) {
    const rating = lichessRatingForType(data, gameType);
    if (rating !== null) return { rating, gameType };
  }
  return null;
}

/**
 * Returns a text skill level such as "lichess rapid 1520" from the linked profile.
 * Returns null when no linked profile exists or rating cannot be resolved quickly.
 */
export async function getPlayerSkillLevelForUser(userId: string): Promise<string | null> {
  const now = Date.now();
  const cached = skillCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.value;

  const linkedProfile = await getLinkedChessProfileForUser(userId);
  if (!linkedProfile) {
    skillCache.set(userId, { value: null, expiresAt: now + SKILL_CACHE_TTL_MS });
    return null;
  }

  const preferredGameType = linkedProfile.performancePreferences?.gameType ?? "all";

  try {
    const resolved =
      linkedProfile.provider === "chesscom"
        ? await fetchChessComRating(linkedProfile.username, preferredGameType)
        : await fetchLichessRating(linkedProfile.username, preferredGameType);

    const value = resolved
      ? `${linkedProfile.provider} ${resolved.gameType} ${resolved.rating}`
      : null;

    skillCache.set(userId, { value, expiresAt: now + SKILL_CACHE_TTL_MS });
    return value;
  } catch {
    skillCache.set(userId, { value: null, expiresAt: now + SKILL_CACHE_TTL_MS });
    return null;
  }
}


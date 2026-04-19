export const CHESS_PROFILE_COOKIE = "chessview_linked_profile";

export const PERFORMANCE_RANGE_OPTIONS = [15, 30, 90, 365] as const;
export const PERFORMANCE_GAME_TYPE_OPTIONS = [
  "all",
  "bullet",
  "blitz",
  "rapid",
  "classical",
  "daily",
] as const;

export type ChessProvider = "chesscom" | "lichess";
export type PerformanceRangeDays = (typeof PERFORMANCE_RANGE_OPTIONS)[number];
export type PerformanceGameType = (typeof PERFORMANCE_GAME_TYPE_OPTIONS)[number];

export interface LinkedChessProfile {
  provider: ChessProvider;
  username: string;
  linkedAt: string;
}

export interface PerformancePreferences {
  rangeDays: PerformanceRangeDays;
  gameType: PerformanceGameType;
}

const PROFILE_USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/;

export function normalizeChessProvider(value?: string | null): ChessProvider | null {
  if (value === "chesscom" || value === "lichess") return value;
  return null;
}

export function getChessProviderLabel(provider: ChessProvider) {
  return provider === "chesscom" ? "Chess.com" : "Lichess";
}

export function getChessProfileUrl(profile: LinkedChessProfile) {
  if (profile.provider === "chesscom") {
    return `https://www.chess.com/member/${encodeURIComponent(profile.username)}`;
  }

  return `https://lichess.org/@/${encodeURIComponent(profile.username)}`;
}

export function buildLinkedChessProfileKey(
  profile: Pick<LinkedChessProfile, "provider" | "username">,
) {
  return `${profile.provider}:${String(profile.username || "").trim().toLowerCase()}`;
}

export function normalizeLinkedChessProfileKey(value?: string | null) {
  const raw = String(value || "").trim();
  const separatorIndex = raw.indexOf(":");
  if (separatorIndex <= 0) return null;

  const provider = normalizeChessProvider(raw.slice(0, separatorIndex).toLowerCase());
  if (!provider) return null;

  const username = normalizeChessUsername(provider, raw.slice(separatorIndex + 1));
  if (!username) return null;

  return buildLinkedChessProfileKey({ provider, username });
}

export function normalizeChessUsername(
  provider: ChessProvider,
  value?: string | null,
) {
  if (!value) return "";

  let normalized = value.trim();

  try {
    const url = new URL(normalized);
    const parts = url.pathname.split("/").filter(Boolean);

    if (provider === "chesscom") {
      if (parts[0] === "member" || parts[0] === "player") {
        normalized = parts[parts.length - 1] ?? normalized;
      }
    } else if (parts[0] === "@") {
      normalized = parts[1] ?? normalized;
    } else if (parts.length > 0) {
      normalized = parts[parts.length - 1] ?? normalized;
    }
  } catch {}

  normalized = normalized.replace(/^@+/, "").replace(/\/+$/, "").trim();

  if (provider === "chesscom") {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

export function isValidChessUsername(value: string) {
  return PROFILE_USERNAME_PATTERN.test(value);
}

export function serializeLinkedChessProfile(profile: LinkedChessProfile) {
  return encodeURIComponent(JSON.stringify(profile));
}

export function parseLinkedChessProfile(value?: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<LinkedChessProfile>;
    const provider = normalizeChessProvider(parsed.provider);

    if (
      provider &&
      typeof parsed.username === "string" &&
      parsed.username.length > 0 &&
      typeof parsed.linkedAt === "string"
    ) {
      return {
        provider,
        username: parsed.username,
        linkedAt: parsed.linkedAt,
      } satisfies LinkedChessProfile;
    }
  } catch {}

  return null;
}

export function normalizeRangeDays(value?: string | string[] | null): PerformanceRangeDays {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(candidate ?? "", 10);

  if (isPerformanceRangeDays(parsed)) {
    return parsed;
  }

  return 90;
}

export function normalizeGameType(value?: string | string[] | null): PerformanceGameType {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (isPerformanceGameType(candidate)) {
    return candidate;
  }

  return "all";
}

export function getRangeLabel(rangeDays: PerformanceRangeDays) {
  if (rangeDays === 15) return "15 Days";
  if (rangeDays === 365) return "1 Year";
  return `${rangeDays} Days`;
}

export function getGameTypeLabel(gameType: PerformanceGameType) {
  switch (gameType) {
    case "all":
      return "All";
    case "bullet":
      return "Bullet";
    case "blitz":
      return "Blitz";
    case "rapid":
      return "Rapid";
    case "classical":
      return "Classical";
    case "daily":
      return "Daily";
  }
}

export function isPerformanceRangeDays(value: unknown): value is PerformanceRangeDays {
  return value === 15 || value === 30 || value === 90 || value === 365;
}

export function isPerformanceGameType(value: unknown): value is PerformanceGameType {
  return (
    value === "all" ||
    value === "bullet" ||
    value === "blitz" ||
    value === "rapid" ||
    value === "classical" ||
    value === "daily"
  );
}

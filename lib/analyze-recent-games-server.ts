import {
  buildLinkedChessProfileKey,
  type ChessProvider,
  type LinkedChessProfile,
  getChessProviderLabel,
} from "@/lib/chess-profile";

const REQUEST_TIMEOUT_MS = 20000;
const MAX_RECENT_IMPORT_GAMES = 8;

type PlayerColor = "white" | "black";
type GameResult = "win" | "draw" | "loss";
type RecentTimeType =
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical"
  | "daily"
  | "other";

interface ChessComArchiveResponse {
  games?: ChessComGame[];
}

interface ChessComGame {
  url?: string;
  pgn?: string;
  time_control?: string;
  end_time?: number;
  time_class?: string;
  rules?: string;
  white?: ChessComPlayer;
  black?: ChessComPlayer;
}

interface ChessComPlayer {
  username?: string;
  result?: string;
  rating?: number;
}

interface LichessGame {
  id?: string;
  variant?: string;
  perf?: string;
  lastMoveAt?: number;
  winner?: PlayerColor;
  opening?: { name?: string };
  pgn?: string;
  clock?: { initial?: number; increment?: number };
  players?: {
    white?: { user?: { name?: string }; rating?: number; ratingDiff?: number };
    black?: { user?: { name?: string }; rating?: number; ratingDiff?: number };
  };
}

export interface RecentImportGame {
  id: string;
  provider: ChessProvider;
  providerLabel: string;
  profileKey: string;
  profileUsername: string;
  profileLabel: string;
  url: string;
  pgn: string;
  openingName: string | null;
  opponentName: string;
  opponentRating: number | null;
  userColor: PlayerColor;
  result: GameResult;
  playedAtMs: number;
  timeLabel: string;
}

export async function getRecentImportGames(
  profiles: LinkedChessProfile[],
): Promise<RecentImportGame[]> {
  const settled = await Promise.allSettled(
    profiles.map(async (profile) => {
      const games =
        profile.provider === "chesscom"
          ? await fetchRecentChessComGames(profile.username)
          : await fetchRecentLichessGames(profile.username);

      const profileLabel = `${getChessProviderLabel(profile.provider)} · ${profile.username}`;
      const profileKey = buildLinkedChessProfileKey(profile);

      return games.map((game) => ({
        ...game,
        profileKey,
        profileUsername: profile.username,
        profileLabel,
      }));
    }),
  );

  const combined = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  if (!combined.length) {
    const rejected = settled.find((result) => result.status === "rejected");
    if (rejected && rejected.status === "rejected") {
      throw rejected.reason;
    }
  }

  return combined
    .sort((left, right) => right.playedAtMs - left.playedAtMs)
    .slice(0, Math.max(MAX_RECENT_IMPORT_GAMES, profiles.length * MAX_RECENT_IMPORT_GAMES));
}

async function fetchRecentChessComGames(
  username: string,
): Promise<RecentImportGame[]> {
  const archivesResponse = await fetchJson<{ archives?: string[] }>(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
  );
  const archiveUrls = [...(archivesResponse.archives ?? [])].reverse();
  const games: RecentImportGame[] = [];

  for (const archiveUrl of archiveUrls) {
    if (games.length >= MAX_RECENT_IMPORT_GAMES) break;
    const archive = await fetchJson<ChessComArchiveResponse>(archiveUrl).catch(
      () => ({ games: [] }),
    );
    const normalized = (archive.games ?? [])
      .map((game, index) => normalizeChessComRecentGame(username, game, index))
      .filter(isRecentImportGame)
      .sort((left, right) => right.playedAtMs - left.playedAtMs);

    games.push(...normalized);
  }

  return games;
}

async function fetchRecentLichessGames(
  username: string,
): Promise<RecentImportGame[]> {
  const endpoint = new URL(
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}`,
  );
  endpoint.searchParams.set("max", String(MAX_RECENT_IMPORT_GAMES));
  endpoint.searchParams.set("opening", "true");
  endpoint.searchParams.set("pgnInJson", "true");
  endpoint.searchParams.set("clocks", "true");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/x-ndjson",
      "User-Agent": "ChessviewLocalDev/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Lichess request failed with status ${response.status}`);
  }

  return (await response.text())
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LichessGame)
    .map((game, index) => normalizeLichessRecentGame(username, game, index))
    .filter(isRecentImportGame);
}

function normalizeChessComRecentGame(
  username: string,
  game: ChessComGame,
  index: number,
): RecentImportGame | null {
  if (game.rules && game.rules !== "chess") return null;
  if (!game.pgn?.trim()) return null;

  const whiteName = game.white?.username?.trim();
  const blackName = game.black?.username?.trim();
  const normalizedUser = username.toLowerCase();
  const userColor =
    whiteName?.toLowerCase() === normalizedUser
      ? "white"
      : blackName?.toLowerCase() === normalizedUser
        ? "black"
        : null;

  if (!userColor) return null;

  const { initialSeconds, incrementSeconds } = parseChessComTimeControl(
    game.time_control,
  );
  const timeType = normalizeChessComTimeType(game.time_class, initialSeconds);
  const result = resolveChessComResult(userColor, game);
  if (!result) return null;

  return {
    id: game.url ?? `chesscom-recent-${index}`,
    provider: "chesscom",
    providerLabel: getChessProviderLabel("chesscom"),
    profileKey: "",
    profileUsername: username,
    profileLabel: "",
    url: game.url ?? extractPgnTag(game.pgn, "Link") ?? "",
    pgn: game.pgn,
    openingName:
      extractPgnTag(game.pgn, "Opening") ??
      extractOpeningNameFromUrl(extractPgnTag(game.pgn, "ECOUrl")) ??
      null,
    opponentName:
      userColor === "white" ? blackName ?? "Opponent" : whiteName ?? "Opponent",
    opponentRating:
      userColor === "white" ? game.black?.rating ?? null : game.white?.rating ?? null,
    userColor,
    result,
    playedAtMs: Number(game.end_time ?? 0) * 1000,
    timeLabel: formatTimeLabel(timeType, initialSeconds, incrementSeconds),
  };
}

function normalizeLichessRecentGame(
  username: string,
  game: LichessGame,
  index: number,
): RecentImportGame | null {
  if (game.variant && game.variant !== "standard") return null;
  if (!game.pgn?.trim()) return null;

  const whiteName = game.players?.white?.user?.name?.trim();
  const blackName = game.players?.black?.user?.name?.trim();
  const normalizedUser = username.toLowerCase();
  const userColor =
    whiteName?.toLowerCase() === normalizedUser
      ? "white"
      : blackName?.toLowerCase() === normalizedUser
        ? "black"
        : null;

  if (!userColor) return null;

  const initialSeconds = parseMaybeNumber(game.clock?.initial);
  const incrementSeconds = parseMaybeNumber(game.clock?.increment) ?? 0;
  const timeType = normalizeLichessTimeType(game.perf, initialSeconds);

  return {
    id: game.id ?? `lichess-recent-${index}`,
    provider: "lichess",
    providerLabel: getChessProviderLabel("lichess"),
    profileKey: "",
    profileUsername: username,
    profileLabel: "",
    url: game.id ? `https://lichess.org/${game.id}` : "",
    pgn: game.pgn,
    openingName: game.opening?.name ?? null,
    opponentName:
      userColor === "white" ? blackName ?? "Opponent" : whiteName ?? "Opponent",
    opponentRating:
      userColor === "white"
        ? game.players?.black?.rating ?? null
        : game.players?.white?.rating ?? null,
    userColor,
    result: resolveLichessResult(userColor, game.winner),
    playedAtMs: Number(game.lastMoveAt ?? 0),
    timeLabel: formatTimeLabel(timeType, initialSeconds, incrementSeconds),
  };
}

function isRecentImportGame(
  game: RecentImportGame | null,
): game is RecentImportGame {
  return game !== null;
}

function resolveChessComResult(userColor: PlayerColor, game: ChessComGame) {
  const userResult =
    userColor === "white" ? game.white?.result ?? null : game.black?.result ?? null;
  const opponentResult =
    userColor === "white" ? game.black?.result ?? null : game.white?.result ?? null;

  if (!userResult && !opponentResult) return null;
  if (userResult === "win") return "win";
  if (opponentResult === "win") return "loss";
  if (isChessComDrawResult(userResult) || isChessComDrawResult(opponentResult)) {
    return "draw";
  }
  if (isChessComLossResult(userResult)) return "loss";
  if (isChessComLossResult(opponentResult)) return "win";
  return "draw";
}

function resolveLichessResult(userColor: PlayerColor, winner?: PlayerColor) {
  if (!winner) return "draw";
  return winner === userColor ? "win" : "loss";
}

function isChessComDrawResult(result?: string | null) {
  return (
    result === "agreed" ||
    result === "repetition" ||
    result === "stalemate" ||
    result === "insufficient" ||
    result === "50move" ||
    result === "timevsinsufficient" ||
    result === "noresult"
  );
}

function isChessComLossResult(result?: string | null) {
  return (
    result === "checkmated" ||
    result === "timeout" ||
    result === "resigned" ||
    result === "abandoned" ||
    result === "lose" ||
    result === "kingofthehill" ||
    result === "threecheck"
  );
}

function normalizeChessComTimeType(
  timeClass?: string,
  initialSeconds?: number | null,
): RecentTimeType {
  if (timeClass === "bullet" || timeClass === "blitz" || timeClass === "rapid") {
    if ((initialSeconds ?? 0) >= 1800) return "classical";
    return timeClass;
  }
  if (timeClass === "daily") return "daily";
  if ((initialSeconds ?? 0) >= 1800) return "classical";
  return "other";
}

function normalizeLichessTimeType(
  perf?: string,
  initialSeconds?: number | null,
): RecentTimeType {
  switch ((perf ?? "").toLowerCase()) {
    case "ultrabullet":
    case "bullet":
      return "bullet";
    case "blitz":
      return "blitz";
    case "rapid":
      return "rapid";
    case "classical":
      return "classical";
    case "correspondence":
      return "daily";
    default:
      if ((initialSeconds ?? 0) >= 1800) return "classical";
      return "other";
  }
}

function parseChessComTimeControl(timeControl?: string) {
  if (!timeControl) return { initialSeconds: null, incrementSeconds: 0 };

  const normalized = timeControl.trim();

  if (normalized.includes("+")) {
    const [initialPart, incrementPart] = normalized.split("+");
    const initialSeconds = Number.parseInt(initialPart ?? "", 10);
    const incrementSeconds = Number.parseInt(incrementPart ?? "", 10);

    return {
      initialSeconds: Number.isFinite(initialSeconds) ? initialSeconds : null,
      incrementSeconds: Number.isFinite(incrementSeconds) ? incrementSeconds : 0,
    };
  }

  if (normalized.includes("/")) {
    const [movesPart, basePart] = normalized.split("/");
    const baseSeconds = Number.parseInt(basePart ?? "", 10);

    if (movesPart === "1") {
      return {
        initialSeconds: Number.isFinite(baseSeconds) ? baseSeconds : null,
        incrementSeconds: 0,
      };
    }
  }

  const flatSeconds = Number.parseInt(normalized, 10);
  return {
    initialSeconds: Number.isFinite(flatSeconds) ? flatSeconds : null,
    incrementSeconds: 0,
  };
}

function formatTimeLabel(
  timeType: RecentTimeType,
  initialSeconds?: number | null,
  incrementSeconds = 0,
) {
  const label = getTimeTypeLabel(timeType);
  const control = formatClockControl(initialSeconds, incrementSeconds);
  return control ? `${label} · ${control}` : label;
}

function getTimeTypeLabel(timeType: RecentTimeType) {
  switch (timeType) {
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
    default:
      return "Recent";
  }
}

function formatClockControl(
  initialSeconds?: number | null,
  incrementSeconds = 0,
) {
  if (initialSeconds === null || initialSeconds === undefined) return "";
  const base =
    initialSeconds >= 60 && initialSeconds % 60 === 0
      ? String(initialSeconds / 60)
      : `${initialSeconds}s`;
  return `${base}+${incrementSeconds}`;
}

function extractPgnTag(pgn: string | undefined, tagName: string) {
  if (!pgn) return null;
  const pattern = new RegExp(`\\[${tagName} "([^"]+)"\\]`);
  const match = pgn.match(pattern);
  return match?.[1] ?? null;
}

function extractOpeningNameFromUrl(url: string | null) {
  if (!url) return null;

  try {
    const pathname = new URL(url).pathname;
    const slug = pathname.split("/").filter(Boolean).pop();
    if (!slug) return null;

    return decodeURIComponent(slug)
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return null;
  }
}

function parseMaybeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ChessviewLocalDev/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

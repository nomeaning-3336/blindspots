import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  PERFORMANCE_RANGE_OPTIONS,
  type ChessProvider,
  type LinkedChessProfile,
  getChessProfileUrl,
  getChessProviderLabel,
} from "@/lib/chess-profile";
import {
  buildPerformanceSnapshot,
  type NormalizedGame,
  type PieceType,
  type PerformanceReport,
  type SnapshotFilters,
} from "@/lib/chess-performance-report";

const REQUEST_TIMEOUT_MS = 20000;
const PERFORMANCE_CACHE_VERSION = 3;
const PERFORMANCE_CACHE_DIR = resolve(process.cwd(), "cache", "performance");
const MAX_PERFORMANCE_RANGE_DAYS = Math.max(...PERFORMANCE_RANGE_OPTIONS);
const MAX_PERFORMANCE_RANGE_MS =
  MAX_PERFORMANCE_RANGE_DAYS * 24 * 60 * 60 * 1000;

type PlayerColor = "white" | "black";
type GameResult = "win" | "draw" | "loss";
type NormalizedTimeType =
  | Exclude<(typeof PERFORMANCE_RANGE_OPTIONS)[number], never>
  | "other";

interface CachedPerformanceReport {
  version: number;
  provider: ChessProvider;
  username: string;
  totalGameCount: number | null;
  totalFetchedGames: number;
  rangeDaysCovered: number;
  fetchedAt: string;
  games: NormalizedGame[];
}

interface ChessComArchiveResponse {
  games?: ChessComGame[];
}

interface ChessComGame {
  url?: string;
  pgn?: string;
  time_control?: string;
  end_time?: number;
  accuracies?: Record<string, string | number | undefined>;
  white?: ChessComPlayer;
  black?: ChessComPlayer;
  eco?: string;
  time_class?: string;
  rules?: string;
}

interface ChessComPlayer {
  username?: string;
  result?: string;
  rating?: number;
}

interface ChessComStatsBucket {
  record?: {
    win?: number;
    loss?: number;
    draw?: number;
  };
}

interface LichessGame {
  id?: string;
  perf?: string;
  variant?: string;
  lastMoveAt?: number;
  winner?: PlayerColor;
  opening?: { eco?: string; name?: string; ply?: number };
  moves?: string;
  clocks?: number[];
  analysis?: LichessAnalysisEntry[];
  clock?: { initial?: number; increment?: number };
  players?: { white?: LichessPlayer; black?: LichessPlayer };
}

interface LichessPlayer {
  user?: { name?: string };
  rating?: number;
  analysis?: { accuracy?: number };
}

interface LichessAnalysisEntry {
  eval?: number;
  mate?: number;
}

interface LichessUserSummary {
  count?: {
    all?: number;
  };
}

export async function getPerformanceReport(
  profile: LinkedChessProfile,
): Promise<PerformanceReport> {
  const cached = readCachedPerformanceReport(profile);
  const currentTotalGameCount = await fetchProfileGameCount(profile).catch(() => null);

  if (
    cached &&
    cached.rangeDaysCovered >= MAX_PERFORMANCE_RANGE_DAYS &&
    currentTotalGameCount !== null &&
    cached.totalGameCount === currentTotalGameCount
  ) {
    return toPerformanceReport(cached);
  }

  if (
    cached &&
    cached.rangeDaysCovered >= MAX_PERFORMANCE_RANGE_DAYS &&
    currentTotalGameCount === null
  ) {
    return toPerformanceReport(cached);
  }

  try {
    const games = await fetchGamesForProfile(
      profile,
      Date.now() - MAX_PERFORMANCE_RANGE_MS,
    );
    const payload: CachedPerformanceReport = {
      version: PERFORMANCE_CACHE_VERSION,
      provider: profile.provider,
      username: profile.username,
      totalGameCount: currentTotalGameCount,
      totalFetchedGames: games.length,
      rangeDaysCovered: MAX_PERFORMANCE_RANGE_DAYS,
      fetchedAt: new Date().toISOString(),
      games,
    };

    writeCachedPerformanceReport(profile, payload);
    return toPerformanceReport(payload);
  } catch (error) {
    if (cached) {
      return toPerformanceReport(cached);
    }

    throw error;
  }
}

export async function getPerformanceSnapshot(
  profile: LinkedChessProfile,
  filters: SnapshotFilters,
) {
  const report = await getPerformanceReport(profile);
  return buildPerformanceSnapshot(report, filters);
}

async function fetchProfileGameCount(profile: LinkedChessProfile) {
  if (profile.provider === "chesscom") {
    return fetchChessComGameCount(profile.username);
  }

  return fetchLichessGameCount(profile.username);
}

async function fetchChessComGameCount(username: string) {
  const stats = await fetchJson<Record<string, ChessComStatsBucket>>(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/stats`,
  );

  let total = 0;
  let foundAnyRecord = false;

  for (const [key, value] of Object.entries(stats)) {
    if (!key.startsWith("chess_")) continue;
    if (!value || typeof value !== "object" || !value.record) continue;

    const wins = parseMaybeNumber(value.record.win) ?? 0;
    const losses = parseMaybeNumber(value.record.loss) ?? 0;
    const draws = parseMaybeNumber(value.record.draw) ?? 0;
    total += wins + losses + draws;
    foundAnyRecord = true;
  }

  return foundAnyRecord ? total : null;
}

async function fetchLichessGameCount(username: string) {
  const summary = await fetchJson<LichessUserSummary>(
    `https://lichess.org/api/user/${encodeURIComponent(username)}`,
  );

  return parseMaybeNumber(summary.count?.all);
}

function readCachedPerformanceReport(profile: LinkedChessProfile) {
  const cachePath = getPerformanceCachePath(profile);
  if (!existsSync(cachePath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8")) as Partial<CachedPerformanceReport>;

    if (
      parsed.version !== PERFORMANCE_CACHE_VERSION ||
      parsed.provider !== profile.provider ||
      parsed.username !== profile.username ||
      !Array.isArray(parsed.games) ||
      typeof parsed.totalFetchedGames !== "number" ||
      typeof parsed.rangeDaysCovered !== "number" ||
      typeof parsed.fetchedAt !== "string"
    ) {
      return null;
    }

    return parsed as CachedPerformanceReport;
  } catch {
    return null;
  }
}

function writeCachedPerformanceReport(
  profile: LinkedChessProfile,
  payload: CachedPerformanceReport,
) {
  mkdirSync(PERFORMANCE_CACHE_DIR, { recursive: true });
  writeFileSync(
    getPerformanceCachePath(profile),
    JSON.stringify(payload),
    "utf8",
  );
}

function toPerformanceReport(cached: CachedPerformanceReport): PerformanceReport {
  return {
    username: cached.username,
    provider: cached.provider,
    providerLabel: getChessProviderLabel(cached.provider),
    profileUrl: getChessProfileUrl({
      provider: cached.provider,
      username: cached.username,
      linkedAt: cached.fetchedAt,
    }),
    totalGameCount: cached.totalGameCount,
    totalFetchedGames: cached.totalFetchedGames,
    rangeDaysCovered: cached.rangeDaysCovered,
    fetchedAt: cached.fetchedAt,
    games: cached.games,
  };
}

function getPerformanceCachePath(profile: LinkedChessProfile) {
  const safeUsername = profile.username.toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  return resolve(
    PERFORMANCE_CACHE_DIR,
    `${profile.provider}--${safeUsername}.json`,
  );
}

async function fetchGamesForProfile(
  profile: LinkedChessProfile,
  sinceMs: number,
): Promise<NormalizedGame[]> {
  if (profile.provider === "chesscom") {
    return fetchChessComGames(profile.username, sinceMs);
  }

  return fetchLichessGames(profile.username, sinceMs);
}

async function fetchChessComGames(
  username: string,
  sinceMs: number,
): Promise<NormalizedGame[]> {
  const archivesResponse = await fetchJson<{ archives?: string[] }>(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
  );
  const monthUrls = (archivesResponse.archives ?? []).filter((archiveUrl) => {
    const parts = archiveUrl.split("/").slice(-2);
    const year = Number.parseInt(parts[0] ?? "", 10);
    const month = Number.parseInt(parts[1] ?? "", 10);

    if (!Number.isFinite(year) || !Number.isFinite(month)) return false;

    const monthEndMs = Date.UTC(year, month, 1) - 1;
    return monthEndMs >= sinceMs;
  });

  const archives = await Promise.all(
    monthUrls.map((archiveUrl) =>
      fetchJson<ChessComArchiveResponse>(archiveUrl).catch(() => ({ games: [] })),
    ),
  );

  return archives
    .flatMap((archive) => archive.games ?? [])
    .map((game, index) => normalizeChessComGame(username, game, index))
    .filter(isNormalizedGame);
}

async function fetchLichessGames(
  username: string,
  sinceMs: number,
): Promise<NormalizedGame[]> {
  const endpoint = new URL(
    `https://lichess.org/api/games/user/${encodeURIComponent(username)}`,
  );
  endpoint.searchParams.set("since", String(sinceMs));
  endpoint.searchParams.set("max", "1000");
  endpoint.searchParams.set("opening", "true");
  endpoint.searchParams.set("clocks", "true");
  endpoint.searchParams.set("evals", "true");
  endpoint.searchParams.set("accuracy", "true");
  endpoint.searchParams.set("moves", "true");

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
    .map((game, index) => normalizeLichessGame(username, game, index))
    .filter(isNormalizedGame);
}

function normalizeChessComGame(
  username: string,
  game: ChessComGame,
  index: number,
): NormalizedGame | null {
  if (game.rules && game.rules !== "chess") return null;

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

  const opponentColor: PlayerColor = userColor === "white" ? "black" : "white";
  const { initialSeconds, incrementSeconds } = parseChessComTimeControl(game.time_control);
  const clocks = extractClockSecondsFromPgn(game.pgn);
  const moveDurations =
    initialSeconds !== null
      ? deriveMoveDurationsFromRemainingClocks(clocks, initialSeconds, incrementSeconds)
      : { white: [], black: [] };
  const movePieceTypes = buildMovePieceTypesFromSanPgn(game.pgn);
  const result = resolveChessComResult(userColor, game);

  if (!result) return null;

  return {
    id: game.url ?? `chesscom-${index}`,
    url: game.url ?? extractPgnTag(game.pgn, "Link") ?? "",
    provider: "chesscom",
    endTimeMs: Number(game.end_time ?? 0) * 1000,
    timeType: normalizeChessComTimeType(game.time_class, initialSeconds),
    userColor,
    opponentName:
      userColor === "white" ? blackName ?? "Opponent" : whiteName ?? "Opponent",
    result,
    openingName:
      extractPgnTag(game.pgn, "Opening") ?? extractOpeningNameFromUrl(game.eco),
    openingCode: extractPgnTag(game.pgn, "ECO"),
    userAccuracy: parseMaybeNumber(game.accuracies?.[userColor]),
    opponentAccuracy: parseMaybeNumber(game.accuracies?.[opponentColor]),
    userRating:
      userColor === "white"
        ? parseMaybeNumber(game.white?.rating)
        : parseMaybeNumber(game.black?.rating),
    initialSeconds,
    incrementSeconds,
    totalPlies: Math.max(clocks.length, countPgnPlies(game.pgn)),
    openingPly: null,
    userMoveDurations: moveDurations[userColor],
    opponentMoveDurations: moveDurations[opponentColor],
    userMoveCpLosses: [],
    opponentMoveCpLosses: [],
    userMovePieceTypes:
      userColor === "white" ? movePieceTypes.white : movePieceTypes.black,
    opponentMovePieceTypes:
      userColor === "white" ? movePieceTypes.black : movePieceTypes.white,
    pgn: game.pgn,
  };
}

function normalizeLichessGame(
  username: string,
  game: LichessGame,
  index: number,
): NormalizedGame | null {
  if (game.variant && game.variant !== "standard") return null;

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

  const opponentColor: PlayerColor = userColor === "white" ? "black" : "white";
  const totalPlies = countMoveTokens(game.moves);
  const initialSeconds = parseMaybeNumber(game.clock?.initial);
  const incrementSeconds = parseMaybeNumber(game.clock?.increment) ?? 0;
  const clocks = Array.isArray(game.clocks)
    ? game.clocks.map((clock) => Number(clock) / 100)
    : [];
  const moveDurations =
    initialSeconds !== null
      ? deriveMoveDurationsFromRemainingClocks(clocks, initialSeconds, incrementSeconds)
      : { white: [], black: [] };
  const moveCpLosses = buildMoveCpLosses(game.analysis, totalPlies);
  const movePieceTypes = buildMovePieceTypesFromUciMoves(game.moves);

  return {
    id: game.id ?? `lichess-${index}`,
    url: game.id ? `https://lichess.org/${game.id}` : "",
    provider: "lichess",
    endTimeMs: Number(game.lastMoveAt ?? 0),
    timeType: normalizeLichessTimeType(game.perf, initialSeconds),
    userColor,
    opponentName:
      userColor === "white" ? blackName ?? "Opponent" : whiteName ?? "Opponent",
    result: resolveLichessResult(userColor, game.winner),
    openingName: game.opening?.name ?? null,
    openingCode: game.opening?.eco ?? null,
    userAccuracy:
      userColor === "white"
        ? parseMaybeNumber(game.players?.white?.analysis?.accuracy)
        : parseMaybeNumber(game.players?.black?.analysis?.accuracy),
    opponentAccuracy:
      userColor === "white"
        ? parseMaybeNumber(game.players?.black?.analysis?.accuracy)
        : parseMaybeNumber(game.players?.white?.analysis?.accuracy),
    userRating:
      userColor === "white"
        ? parseMaybeNumber(game.players?.white?.rating)
        : parseMaybeNumber(game.players?.black?.rating),
    initialSeconds,
    incrementSeconds,
    totalPlies,
    openingPly: parseMaybeNumber(game.opening?.ply),
    userMoveDurations: moveDurations[userColor],
    opponentMoveDurations: moveDurations[opponentColor],
    userMoveCpLosses:
      userColor === "white" ? moveCpLosses.white : moveCpLosses.black,
    opponentMoveCpLosses:
      userColor === "white" ? moveCpLosses.black : moveCpLosses.white,
    userMovePieceTypes:
      userColor === "white" ? movePieceTypes.white : movePieceTypes.black,
    opponentMovePieceTypes:
      userColor === "white" ? movePieceTypes.black : movePieceTypes.white,
    movesUci: game.moves,
  };
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
): NormalizedGame["timeType"] {
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
): NormalizedGame["timeType"] {
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

function isNormalizedGame(game: NormalizedGame | null): game is NormalizedGame {
  return game !== null;
}

function buildMoveCpLosses(
  analysis: LichessAnalysisEntry[] | undefined,
  totalPlies: number,
) {
  const white: Array<number | null> = [];
  const black: Array<number | null> = [];

  if (!Array.isArray(analysis) || totalPlies === 0) {
    return { white, black };
  }

  let previousEval = 0;

  for (let ply = 1; ply <= totalPlies; ply += 1) {
    const currentEval = normalizeAnalysisEval(analysis[ply - 1]);

    if (currentEval === null) {
      if (ply % 2 === 1) white.push(null);
      else black.push(null);
      continue;
    }

    const cpLoss =
      ply % 2 === 1
        ? Math.max(0, previousEval - currentEval)
        : Math.max(0, currentEval - previousEval);

    if (ply % 2 === 1) white.push(cpLoss);
    else black.push(cpLoss);
    previousEval = currentEval;
  }

  return { white, black };
}

function deriveMoveDurationsFromRemainingClocks(
  remainingClocks: number[],
  initialSeconds: number,
  incrementSeconds: number,
) {
  const durations = { white: [] as number[], black: [] as number[] };
  let previousWhite = initialSeconds;
  let previousBlack = initialSeconds;

  for (let ply = 0; ply < remainingClocks.length; ply += 1) {
    const currentRemaining = remainingClocks[ply];
    if (!Number.isFinite(currentRemaining)) continue;

    if (ply % 2 === 0) {
      const spent = clamp(
        previousWhite + incrementSeconds - currentRemaining,
        0,
        previousWhite + incrementSeconds,
      );
      durations.white.push(roundToTenths(spent));
      previousWhite = currentRemaining;
    } else {
      const spent = clamp(
        previousBlack + incrementSeconds - currentRemaining,
        0,
        previousBlack + incrementSeconds,
      );
      durations.black.push(roundToTenths(spent));
      previousBlack = currentRemaining;
    }
  }

  return durations;
}

function extractClockSecondsFromPgn(pgn?: string) {
  if (!pgn) return [];

  const clocks: number[] = [];
  const pattern = /\[%clk (\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/g;

  for (const match of pgn.matchAll(pattern)) {
    const hours = Number.parseInt(match[1] ?? "0", 10);
    const minutes = Number.parseInt(match[2] ?? "0", 10);
    const seconds = Number.parseFloat(match[3] ?? "0");
    clocks.push(hours * 3600 + minutes * 60 + seconds);
  }

  return clocks;
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

function extractPgnTag(pgn: string | undefined, tagName: string) {
  if (!pgn) return null;
  const pattern = new RegExp(`\\[${tagName} "([^"]+)"\\]`);
  const match = pgn.match(pattern);
  return match?.[1] ?? null;
}

function countPgnPlies(pgn?: string) {
  if (!pgn) return 0;

  return pgn
    .replace(/^\[[^\n]+\]\s*$/gm, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\d+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^\d+\.(\.\.)?$/.test(token))
    .filter((token) => !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)).length;
}

function countMoveTokens(moves?: string) {
  if (!moves) return 0;
  return moves
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean).length;
}

function extractSanMovesFromPgn(pgn?: string) {
  if (!pgn) return [];

  return pgn
    .replace(/^\[[^\n]+\]\s*$/gm, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\d+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^\d+\.(\.\.)?$/.test(token))
    .filter((token) => !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token));
}

function parsePieceTypeFromSanMove(sanMove: string): PieceType | null {
  const cleaned = sanMove.replace(/[+#?!]+$/g, "");

  if (cleaned.startsWith("O-O")) return "king";

  const first = cleaned[0];
  if (first === "K") return "king";
  if (first === "Q") return "queen";
  if (first === "R") return "rook";
  if (first === "B") return "bishop";
  if (first === "N") return "knight";

  if (/^[a-h]/.test(cleaned)) return "pawn";
  return null;
}

function buildMovePieceTypesFromSanPgn(pgn?: string) {
  const white: PieceType[] = [];
  const black: PieceType[] = [];
  const sanMoves = extractSanMovesFromPgn(pgn);

  for (let ply = 0; ply < sanMoves.length; ply += 1) {
    const pieceType = parsePieceTypeFromSanMove(sanMoves[ply] ?? "");
    if (!pieceType) continue;

    if (ply % 2 === 0) white.push(pieceType);
    else black.push(pieceType);
  }

  return { white, black };
}

type UciBoardState = Map<string, string>;

function buildMovePieceTypesFromUciMoves(moves?: string) {
  const white: PieceType[] = [];
  const black: PieceType[] = [];
  if (!moves) return { white, black };

  const board = createInitialBoardState();
  const moveTokens = moves
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (let ply = 0; ply < moveTokens.length; ply += 1) {
    const token = moveTokens[ply] ?? "";
    const pieceType = applyUciMoveAndResolvePieceType(board, token, ply % 2 === 0);

    if (!pieceType) continue;
    if (ply % 2 === 0) white.push(pieceType);
    else black.push(pieceType);
  }

  return { white, black };
}

function createInitialBoardState(): UciBoardState {
  const board: UciBoardState = new Map();
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

  for (const file of files) {
    board.set(`${file}2`, "P");
    board.set(`${file}7`, "p");
  }

  board.set("a1", "R");
  board.set("h1", "R");
  board.set("a8", "r");
  board.set("h8", "r");
  board.set("b1", "N");
  board.set("g1", "N");
  board.set("b8", "n");
  board.set("g8", "n");
  board.set("c1", "B");
  board.set("f1", "B");
  board.set("c8", "b");
  board.set("f8", "b");
  board.set("d1", "Q");
  board.set("d8", "q");
  board.set("e1", "K");
  board.set("e8", "k");

  return board;
}

function applyUciMoveAndResolvePieceType(
  board: UciBoardState,
  move: string,
  whiteToMove: boolean,
): PieceType | null {
  const normalized = move.toLowerCase();
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(normalized)) return null;

  const from = normalized.slice(0, 2);
  const to = normalized.slice(2, 4);
  const promotion = normalized[4] ?? null;
  const movingPiece = board.get(from);
  if (!movingPiece) return null;

  const pieceType = pieceTypeFromBoardPiece(movingPiece);
  const isWhitePiece = movingPiece === movingPiece.toUpperCase();
  const expectedColorMatches = whiteToMove ? isWhitePiece : !isWhitePiece;
  if (!expectedColorMatches) return null;

  board.delete(from);

  if (pieceType === "king" && Math.abs(fileIndex(from[0]) - fileIndex(to[0])) === 2) {
    if (to === "g1") {
      const rook = board.get("h1");
      if (rook) {
        board.delete("h1");
        board.set("f1", rook);
      }
    } else if (to === "c1") {
      const rook = board.get("a1");
      if (rook) {
        board.delete("a1");
        board.set("d1", rook);
      }
    } else if (to === "g8") {
      const rook = board.get("h8");
      if (rook) {
        board.delete("h8");
        board.set("f8", rook);
      }
    } else if (to === "c8") {
      const rook = board.get("a8");
      if (rook) {
        board.delete("a8");
        board.set("d8", rook);
      }
    }
  }

  if (
    pieceType === "pawn" &&
    from[0] !== to[0] &&
    !board.has(to)
  ) {
    const toRank = Number.parseInt(to[1] ?? "0", 10);
    const capturedRank = whiteToMove ? toRank - 1 : toRank + 1;
    board.delete(`${to[0]}${capturedRank}`);
  }

  if (promotion && pieceType === "pawn") {
    const promoted = whiteToMove ? promotion.toUpperCase() : promotion;
    board.set(to, promoted);
  } else {
    board.set(to, movingPiece);
  }

  return pieceType;
}

function fileIndex(file: string | undefined) {
  if (!file) return -1;
  return "abcdefgh".indexOf(file);
}

function pieceTypeFromBoardPiece(piece: string): PieceType | null {
  const normalized = piece.toUpperCase();
  if (normalized === "P") return "pawn";
  if (normalized === "N") return "knight";
  if (normalized === "B") return "bishop";
  if (normalized === "R") return "rook";
  if (normalized === "Q") return "queen";
  if (normalized === "K") return "king";
  return null;
}

function extractOpeningNameFromUrl(ecoUrl?: string) {
  if (!ecoUrl) return null;

  try {
    const pathname = new URL(ecoUrl).pathname;
    const slug = pathname.split("/").filter(Boolean).pop();
    return slug ? decodeURIComponent(slug).replace(/-/g, " ") : null;
  } catch {
    return null;
  }
}

function normalizeAnalysisEval(entry?: LichessAnalysisEntry) {
  if (!entry) return null;
  if (typeof entry.eval === "number") return entry.eval;
  if (typeof entry.mate === "number") {
    return Math.sign(entry.mate) * (100000 - Math.min(99, Math.abs(entry.mate)) * 1000);
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

function parseMaybeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundToTenths(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

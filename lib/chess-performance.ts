import {
  type ChessProvider,
  type LinkedChessProfile,
  type PerformanceGameType,
  type PerformanceRangeDays,
  getChessProfileUrl,
  getChessProviderLabel,
} from "@/lib/chess-profile";

const DAY_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20000;
const DEFAULT_OPENING_END_PLY = 12;
const ENDGAME_WINDOW_PLIES = 12;

type PlayerColor = "white" | "black";
type GameResult = "win" | "draw" | "loss";
type NormalizedTimeType = Exclude<PerformanceGameType, "all"> | "other";

interface NormalizedGame {
  id: string;
  url: string;
  provider: ChessProvider;
  endTimeMs: number;
  timeType: NormalizedTimeType;
  userColor: PlayerColor;
  opponentName: string;
  result: GameResult;
  openingName: string | null;
  openingCode: string | null;
  userAccuracy: number | null;
  opponentAccuracy: number | null;
  userRating: number | null;
  initialSeconds: number | null;
  incrementSeconds: number;
  totalPlies: number;
  openingPly: number | null;
  userMoveDurations: number[];
  opponentMoveDurations: number[];
  userMoveCpLosses: Array<number | null>;
  opponentMoveCpLosses: Array<number | null>;
}

export interface RecordSummary {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  scoreRate: number;
}

export interface OpeningSummary {
  name: string;
  code: string | null;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  scoreRate: number;
}

export interface TimeManagementSummary {
  sampleSize: number;
  goodThink: number | null;
  wasted: number | null;
  fastBlunder: number | null;
  efficiency: number | null;
  slowMoves: number;
  fastMoves: number;
}

export interface PhaseAccuracySummary {
  supported: boolean;
  sampleSize: number;
  opening: number | null;
  middlegame: number | null;
  endgame: number | null;
}

export interface RatingPoint {
  label: string;
  timestamp: number;
  rating: number;
}

export interface RatingTrendSummary {
  supported: boolean;
  points: RatingPoint[];
  start: number | null;
  current: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
}

export interface PerformanceSnapshot {
  providerLabel: string;
  profileUrl: string;
  totalFetchedGames: number;
  totalFilteredGames: number;
  liveGames: number;
  notes: string[];
  winRates: {
    overall: RecordSummary;
    white: RecordSummary;
    black: RecordSummary;
  };
  openings: {
    bestOwn: OpeningSummary[];
    worstOwn: OpeningSummary[];
    bestAgainst: OpeningSummary[];
    worstAgainst: OpeningSummary[];
  };
  timeManagement: {
    supported: boolean;
    user: TimeManagementSummary;
    opponent: TimeManagementSummary;
  };
  phaseAccuracy: PhaseAccuracySummary;
  ratingTrend: RatingTrendSummary;
}

interface SnapshotFilters {
  rangeDays: PerformanceRangeDays;
  gameType: PerformanceGameType;
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

export async function getPerformanceSnapshot(
  profile: LinkedChessProfile,
  filters: SnapshotFilters,
) {
  const sinceMs = Date.now() - filters.rangeDays * DAY_MS;
  const fetchedGames: NormalizedGame[] = await fetchGamesForProfile(profile, sinceMs);
  const filteredGames = fetchedGames
    .filter((game) => game.endTimeMs >= sinceMs)
    .filter((game) => matchesGameType(game, filters.gameType))
    .sort((left, right) => right.endTimeMs - left.endTimeMs);

  return {
    providerLabel: getChessProviderLabel(profile.provider),
    profileUrl: getChessProfileUrl(profile),
    totalFetchedGames: fetchedGames.length,
    totalFilteredGames: filteredGames.length,
    liveGames: filteredGames.filter(
      (game) => game.timeType !== "daily" && game.initialSeconds !== null,
    ).length,
    notes: buildNotes(profile.provider, filteredGames),
    winRates: {
      overall: summarizeRecord(filteredGames),
      white: summarizeRecord(filteredGames.filter((game) => game.userColor === "white")),
      black: summarizeRecord(filteredGames.filter((game) => game.userColor === "black")),
    },
    openings: summarizeOpenings(filteredGames),
    timeManagement: summarizeTimeManagement(filteredGames),
    phaseAccuracy: summarizePhaseAccuracy(filteredGames),
    ratingTrend: summarizeRatingTrend(filteredGames),
  } satisfies PerformanceSnapshot;
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
): NormalizedTimeType {
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
): NormalizedTimeType {
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

function matchesGameType(game: NormalizedGame, gameType: PerformanceGameType) {
  if (gameType === "all") return true;
  return game.timeType === gameType;
}

function isNormalizedGame(game: NormalizedGame | null): game is NormalizedGame {
  return game !== null;
}

function summarizeRecord(games: NormalizedGame[]): RecordSummary {
  const wins = games.filter((game) => game.result === "win").length;
  const draws = games.filter((game) => game.result === "draw").length;
  const losses = games.length - wins - draws;

  return {
    games: games.length,
    wins,
    draws,
    losses,
    winRate: toPercent(games.length === 0 ? 0 : (wins / games.length) * 100),
    scoreRate: toPercent(
      games.length === 0 ? 0 : ((wins + draws * 0.5) / games.length) * 100,
    ),
  };
}

function summarizeOpenings(games: NormalizedGame[]) {
  const whiteGames = games.filter(
    (game) => game.userColor === "white" && game.openingName,
  );
  const blackGames = games.filter(
    (game) => game.userColor === "black" && game.openingName,
  );

  return {
    bestOwn: summarizeOpeningBucket(whiteGames, "best"),
    worstOwn: summarizeOpeningBucket(whiteGames, "worst"),
    bestAgainst: summarizeOpeningBucket(blackGames, "best"),
    worstAgainst: summarizeOpeningBucket(blackGames, "worst"),
  };
}

function summarizeOpeningBucket(
  games: NormalizedGame[],
  mode: "best" | "worst",
) {
  const byOpening = new Map<string, OpeningSummary>();

  for (const game of games) {
    if (!game.openingName) continue;

    const key = `${game.openingCode ?? ""}::${game.openingName}`;
    const current =
      byOpening.get(key) ??
      ({
        name: game.openingName,
        code: game.openingCode,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winRate: 0,
        scoreRate: 0,
      } satisfies OpeningSummary);

    current.games += 1;
    if (game.result === "win") current.wins += 1;
    else if (game.result === "draw") current.draws += 1;
    else current.losses += 1;

    byOpening.set(key, current);
  }

  const topMostPlayed = Array.from(byOpening.values())
    .map((opening) => ({
      ...opening,
      winRate: toPercent((opening.wins / opening.games) * 100),
      scoreRate: toPercent(
        ((opening.wins + opening.draws * 0.5) / opening.games) * 100,
      ),
    }))
    .sort((left, right) => {
      if (left.games !== right.games) return right.games - left.games;
      if (left.winRate !== right.winRate) return right.winRate - left.winRate;
      return left.name.localeCompare(right.name);
    })
    .slice(0, 10);

  return topMostPlayed
    .filter((opening) =>
      mode === "best" ? opening.winRate >= 50 : opening.winRate <= 50,
    )
    .sort((left, right) => {
      if (left.winRate !== right.winRate) {
        return mode === "best"
          ? right.winRate - left.winRate
          : left.winRate - right.winRate;
      }

      if (left.games !== right.games) return right.games - left.games;
      if (left.scoreRate !== right.scoreRate) {
        return mode === "best"
          ? right.scoreRate - left.scoreRate
          : left.scoreRate - right.scoreRate;
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, 3);
}

function summarizeTimeManagement(games: NormalizedGame[]) {
  const liveGames = games.filter(
    (game) =>
      game.timeType !== "daily" &&
      game.initialSeconds !== null &&
      game.userMoveDurations.length > 0 &&
      game.opponentMoveDurations.length > 0,
  );

  return {
    supported: liveGames.length > 0,
    user: summarizeTimeManagementForSide(liveGames, "user"),
    opponent: summarizeTimeManagementForSide(liveGames, "opponent"),
  };
}

function summarizeTimeManagementForSide(
  games: NormalizedGame[],
  side: "user" | "opponent",
): TimeManagementSummary {
  let consideredMoves = 0;
  let goodThinkMoves = 0;
  let wastedMoves = 0;
  let fastBlunderMoves = 0;
  let slowMoves = 0;
  let fastMoves = 0;
  let sampleSize = 0;
  let sawBlunderSignal = false;

  for (const game of games) {
    const durations =
      side === "user" ? game.userMoveDurations : game.opponentMoveDurations;
    const cpLosses =
      side === "user" ? game.userMoveCpLosses : game.opponentMoveCpLosses;

    if (durations.length === 0) continue;

    sampleSize += 1;
    const thresholds = getTimeThresholds(game.initialSeconds ?? 300);

    for (let moveIndex = 0; moveIndex < durations.length; moveIndex += 1) {
      const duration = durations[moveIndex];
      const cpLoss = cpLosses[moveIndex] ?? null;

      consideredMoves += 1;
      if (duration <= thresholds.fast) fastMoves += 1;
      if (duration >= thresholds.slow) slowMoves += 1;

      if (
        duration >= thresholds.fast &&
        duration <= thresholds.slow &&
        (cpLoss === null || cpLoss <= 60)
      ) {
        goodThinkMoves += 1;
      }

      if (
        duration >= thresholds.slow &&
        (cpLoss === null ? duration >= thresholds.slow * 1.6 : cpLoss >= 80)
      ) {
        wastedMoves += 1;
      }

      if (cpLoss !== null) {
        sawBlunderSignal = true;

        if (duration <= thresholds.fast && cpLoss >= 140) {
          fastBlunderMoves += 1;
        }
      }
    }
  }

  return {
    sampleSize,
    goodThink:
      consideredMoves > 0 ? toPercent((goodThinkMoves / consideredMoves) * 100) : null,
    wasted:
      consideredMoves > 0 ? toPercent((wastedMoves / consideredMoves) * 100) : null,
    fastBlunder:
      consideredMoves > 0 && sawBlunderSignal
        ? toPercent((fastBlunderMoves / consideredMoves) * 100)
        : null,
    efficiency:
      consideredMoves > 0
        ? toPercent(
            Math.max(
              0,
              ((goodThinkMoves - wastedMoves * 0.5 - fastBlunderMoves) /
                consideredMoves) *
                100,
            ),
          )
        : null,
    slowMoves,
    fastMoves,
  };
}

function summarizePhaseAccuracy(games: NormalizedGame[]): PhaseAccuracySummary {
  const openingScores: number[] = [];
  const middlegameScores: number[] = [];
  const endgameScores: number[] = [];
  let sampleSize = 0;

  for (const game of games) {
    if (game.userMoveCpLosses.length === 0) continue;

    const openingEndPly = clamp(
      game.openingPly ?? DEFAULT_OPENING_END_PLY,
      6,
      Math.max(6, Math.min(game.totalPlies, 18)),
    );
    const endgameStartPly =
      game.totalPlies >= openingEndPly + 8
        ? Math.max(openingEndPly + 1, game.totalPlies - ENDGAME_WINDOW_PLIES + 1)
        : Number.POSITIVE_INFINITY;

    let usedGame = false;

    for (let moveIndex = 0; moveIndex < game.userMoveCpLosses.length; moveIndex += 1) {
      const cpLoss = game.userMoveCpLosses[moveIndex];

      if (cpLoss === null) continue;

      usedGame = true;
      const ply = game.userColor === "white" ? moveIndex * 2 + 1 : moveIndex * 2 + 2;
      const score = cpLossToAccuracy(cpLoss);

      if (ply <= openingEndPly) openingScores.push(score);
      else if (ply >= endgameStartPly) endgameScores.push(score);
      else middlegameScores.push(score);
    }

    if (usedGame) sampleSize += 1;
  }

  return {
    supported:
      openingScores.length > 0 || middlegameScores.length > 0 || endgameScores.length > 0,
    sampleSize,
    opening: averageOrNull(openingScores),
    middlegame: averageOrNull(middlegameScores),
    endgame: averageOrNull(endgameScores),
  };
}

function summarizeRatingTrend(games: NormalizedGame[]): RatingTrendSummary {
  const points = games
    .filter((game) => game.userRating !== null)
    .sort((left, right) => left.endTimeMs - right.endTimeMs)
    .map((game) => ({
      label: formatRatingDateLabel(game.endTimeMs),
      timestamp: game.endTimeMs,
      rating: game.userRating as number,
    }));

  if (points.length === 0) {
    return {
      supported: false,
      points: [],
      start: null,
      current: null,
      high: null,
      low: null,
      change: null,
    };
  }

  const ratings = points.map((point) => point.rating);
  const start = points[0]?.rating ?? null;
  const current = points[points.length - 1]?.rating ?? null;

  return {
    supported: true,
    points: downsampleRatingPoints(points, 48),
    start,
    current,
    high: Math.max(...ratings),
    low: Math.min(...ratings),
    change: start !== null && current !== null ? current - start : null,
  };
}

function buildNotes(provider: ChessProvider, games: NormalizedGame[]) {
  const notes: string[] = [];

  if (provider === "chesscom") {
    notes.push(
      "Phase accuracy and fast blunder metrics stay limited on Chess.com because the public archive exposes overall accuracy but not move-by-move engine evals.",
    );
  }

  if (games.some((game) => game.timeType === "other")) {
    notes.push(
      "Variant and uncommon time controls are filtered down to standard categories where possible. Anything unusual falls outside the main game-type filters.",
    );
  }

  if (games.length === 0) {
    notes.push("No standard games matched this provider, date range, and time-control filter.");
  }

  return notes;
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

function cpLossToAccuracy(cpLoss: number) {
  return toPercent(Math.max(0, 100 * Math.exp(-cpLoss / 140)));
}

function averageOrNull(values: number[]) {
  if (values.length === 0) return null;
  return toPercent(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function getTimeThresholds(initialSeconds: number) {
  if (initialSeconds <= 60) return { fast: 1.5, slow: 6 };
  if (initialSeconds <= 180) return { fast: 2.5, slow: 10 };
  if (initialSeconds <= 300) return { fast: 4, slow: 16 };
  if (initialSeconds <= 600) return { fast: 7, slow: 24 };
  if (initialSeconds <= 1800) return { fast: 12, slow: 40 };
  return { fast: 20, slow: 70 };
}

function downsampleRatingPoints(points: RatingPoint[], maxPoints: number) {
  if (points.length <= maxPoints) return points;

  const sampled: RatingPoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);

  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(points[Math.round(index * step)] as RatingPoint);
  }

  return sampled;
}

function formatRatingDateLabel(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(timestamp);
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

function toPercent(value: number) {
  return Math.round(value * 10) / 10;
}

function roundToTenths(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

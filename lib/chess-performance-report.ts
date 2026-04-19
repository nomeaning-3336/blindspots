import {
  type ChessProvider,
  type PerformanceGameType,
  type PerformanceRangeDays,
} from "@/lib/chess-profile";
import {
  BLUNDER_CP_THRESHOLD,
  INACCURACY_CP_THRESHOLD,
  MISTAKE_CP_THRESHOLD,
  cpLossToAccuracy,
  normalizeCpLoss,
  summarizeTimeManagementOverview,
  type TimeManagementOverview,
} from "@/lib/performance-time-management";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_OPENING_END_PLY = 12;
const ENDGAME_WINDOW_PLIES = 12;
const CENTIPAWNS_PER_PAWN = 100;

export type PieceType = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";

type PlayerColor = "white" | "black";
type GameResult = "win" | "draw" | "loss";
type NormalizedTimeType = Exclude<PerformanceGameType, "all"> | "other";

export interface NormalizedGame {
  id: string;
  url: string;
  provider: ChessProvider;
  profileKey: string;
  profileUsername: string;
  profileLabel: string;
  profileUrl: string;
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
  userMovePieceTypes?: PieceType[];
  opponentMovePieceTypes?: PieceType[];
  movesUci?: string;
  pgn?: string;
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
  children?: OpeningSummary[];
}

export interface PhaseEvalLeakSummary {
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

export interface PieceErrorDistributionEntry {
  piece: PieceType;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
  total: number;
  moveCount: number;
  blunderCount: number;
  blunderRatePct: number;
  accuracyPct: number | null;
  avgCpl: number | null;
  lowSample: boolean;
}

export interface PieceErrorDistributionSummary {
  supported: boolean;
  sampleSize: number;
  totalClassifiedErrors: number;
  pieces: PieceErrorDistributionEntry[];
}

export interface PerformanceSnapshot {
  selectedProfiles: PerformanceProfileSource[];
  totalGameCount: number | null;
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
    white: OpeningSummary[];
    black: OpeningSummary[];
  };
  timeManagement: TimeManagementOverview;
  mostBlunderedPieces: PieceErrorDistributionSummary;
  phaseEvalLeak: PhaseEvalLeakSummary;
  ratingTrend: RatingTrendSummary;
}

export interface SnapshotFilters {
  rangeDays: PerformanceRangeDays;
  gameType: PerformanceGameType;
  profileKeys?: string[];
}

export interface PerformanceProfileSource {
  key: string;
  provider: ChessProvider;
  providerLabel: string;
  username: string;
  profileUrl: string;
  totalGameCount: number | null;
  totalFetchedGames: number;
  fetchedAt: string;
}

export interface PerformanceReport {
  profiles: PerformanceProfileSource[];
  totalGameCount: number | null;
  totalFetchedGames: number;
  rangeDaysCovered: number;
  fetchedAt: string;
  games: NormalizedGame[];
}

export function buildPerformanceSnapshot(
  report: PerformanceReport,
  filters: SnapshotFilters,
): PerformanceSnapshot {
  const selectedProfileKeys = new Set(
    (filters.profileKeys?.length ? filters.profileKeys : report.profiles.map((profile) => profile.key))
      .filter(Boolean),
  );
  const selectedProfiles = report.profiles.filter((profile) =>
    selectedProfileKeys.has(profile.key),
  );
  const sinceMs = Date.now() - filters.rangeDays * DAY_MS;
  const filteredGames = report.games
    .filter((game) => selectedProfileKeys.has(game.profileKey))
    .filter((game) => game.endTimeMs >= sinceMs)
    .filter((game) => matchesGameType(game, filters.gameType))
    .sort((left, right) => right.endTimeMs - left.endTimeMs);

  return {
    selectedProfiles,
    totalGameCount: selectedProfiles.every((profile) => profile.totalGameCount !== null)
      ? selectedProfiles.reduce(
          (sum, profile) => sum + (profile.totalGameCount ?? 0),
          0,
        )
      : null,
    totalFetchedGames: selectedProfiles.reduce(
      (sum, profile) => sum + profile.totalFetchedGames,
      0,
    ),
    totalFilteredGames: filteredGames.length,
    liveGames: filteredGames.filter(
      (game) => game.timeType !== "daily" && game.initialSeconds !== null,
    ).length,
    notes: buildNotes(filteredGames),
    winRates: {
      overall: summarizeRecord(filteredGames),
      white: summarizeRecord(filteredGames.filter((game) => game.userColor === "white")),
      black: summarizeRecord(filteredGames.filter((game) => game.userColor === "black")),
    },
    openings: summarizeOpenings(filteredGames),
    timeManagement: summarizeTimeManagement(filteredGames),
    mostBlunderedPieces: summarizeMostBlunderedPieces(filteredGames),
    phaseEvalLeak: summarizePhaseEvalLeak(filteredGames),
    ratingTrend: summarizeRatingTrend(filteredGames),
  };
}

function matchesGameType(game: NormalizedGame, gameType: PerformanceGameType) {
  if (gameType === "all") return true;
  return game.timeType === gameType;
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
    white: getTopMostPlayedOpenings(whiteGames, 5),
    black: getTopMostPlayedOpenings(blackGames, 5),
  };
}

function getTopMostPlayedOpenings(
  games: NormalizedGame[],
  limit = 10,
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

  const entries = Array.from(byOpening.values()).map((opening) => ({
    ...opening,
    winRate: toPercent((opening.wins / opening.games) * 100),
    scoreRate: toPercent(
      ((opening.wins + opening.draws * 0.5) / opening.games) * 100,
    ),
  }));

  // Group by root opening (text before the colon)
  const byRoot = new Map<string, OpeningSummary[]>();
  for (const entry of entries) {
    const colonIndex = entry.name.indexOf(":");
    const rootName = colonIndex > 0 ? entry.name.slice(0, colonIndex) : entry.name;
    const existing = byRoot.get(rootName) ?? [];
    existing.push(entry);
    byRoot.set(rootName, existing);
  }

  // Build hierarchy: root entries with children, plus ungrouped entries
  const result: OpeningSummary[] = [];
  for (const [rootName, children] of byRoot) {
    const rootEntry = children.find((entry) => entry.name === rootName) ?? null;
    const variations = children
      .filter((entry) => entry.name !== rootName)
      .sort((a, b) => b.games - a.games);

    if (variations.length > 0) {
      // Has variations - create parent entry with children
      const parent: OpeningSummary = {
        name: rootName,
        code: rootEntry?.code ?? variations[0]?.code ?? null,
        games: children.reduce((sum, c) => sum + c.games, 0),
        wins: children.reduce((sum, c) => sum + c.wins, 0),
        draws: children.reduce((sum, c) => sum + c.draws, 0),
        losses: children.reduce((sum, c) => sum + c.losses, 0),
        winRate: 0,
        scoreRate: 0,
        children: variations,
      };
      parent.winRate = toPercent((parent.wins / parent.games) * 100);
      parent.scoreRate = toPercent(
        ((parent.wins + parent.draws * 0.5) / parent.games) * 100,
      );
      result.push(parent);
    } else {
      // Single variation or no colon - add as standalone
      result.push(rootEntry ?? children[0]);
    }
  }

  return result
    .sort((left, right) => {
      if (left.games !== right.games) return right.games - left.games;
      if (left.scoreRate !== right.scoreRate) return right.scoreRate - left.scoreRate;
      if (left.winRate !== right.winRate) return right.winRate - left.winRate;
      return left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}

function summarizeTimeManagement(games: NormalizedGame[]) {
  const liveGames = games.filter(
    (game) => game.timeType !== "daily" && game.initialSeconds !== null,
  );

  return summarizeTimeManagementOverview(liveGames);
}

function summarizePhaseEvalLeak(games: NormalizedGame[]): PhaseEvalLeakSummary {
  let openingLoss = 0;
  let middlegameLoss = 0;
  let endgameLoss = 0;
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
    let gameOpeningLoss = 0;
    let gameMiddlegameLoss = 0;
    let gameEndgameLoss = 0;

    for (let moveIndex = 0; moveIndex < game.userMoveCpLosses.length; moveIndex += 1) {
      const cpLoss = game.userMoveCpLosses[moveIndex];

      if (cpLoss === null) continue;

      usedGame = true;
      const ply = game.userColor === "white" ? moveIndex * 2 + 1 : moveIndex * 2 + 2;
      const normalizedCpLoss = normalizeCpLoss(cpLoss);

      if (ply <= openingEndPly) gameOpeningLoss += normalizedCpLoss;
      else if (ply >= endgameStartPly) gameEndgameLoss += normalizedCpLoss;
      else gameMiddlegameLoss += normalizedCpLoss;
    }

    if (!usedGame) continue;

    sampleSize += 1;
    openingLoss += gameOpeningLoss;
    middlegameLoss += gameMiddlegameLoss;
    endgameLoss += gameEndgameLoss;
  }

  return {
    supported: sampleSize > 0,
    sampleSize,
    opening: phaseLossToEvalPawns(openingLoss, sampleSize),
    middlegame: phaseLossToEvalPawns(middlegameLoss, sampleSize),
    endgame: phaseLossToEvalPawns(endgameLoss, sampleSize),
  };
}

function summarizeMostBlunderedPieces(
  games: NormalizedGame[],
): PieceErrorDistributionSummary {
  const pieces: PieceType[] = ["pawn", "knight", "bishop", "rook", "queen", "king"];
  const buckets = new Map<
    PieceType,
    {
      inaccuracies: number;
      mistakes: number;
      blunders: number;
      qualityMoveCount: number;
      accuracyTotal: number;
      cpLossTotal: number;
    }
  >(
    pieces.map((piece) => [
      piece,
      {
        inaccuracies: 0,
        mistakes: 0,
        blunders: 0,
        qualityMoveCount: 0,
        accuracyTotal: 0,
        cpLossTotal: 0,
      },
    ]),
  );
  let sampleSize = 0;

  for (const game of games) {
    if (game.userMoveCpLosses.length === 0) continue;

    const pieceTypes = game.userMovePieceTypes ?? [];
    let gameUsed = false;

    for (let moveIndex = 0; moveIndex < game.userMoveCpLosses.length; moveIndex += 1) {
      const cpLoss = game.userMoveCpLosses[moveIndex];
      const piece = pieceTypes[moveIndex];

      if (cpLoss === null || !piece) continue;

      const bucket = buckets.get(piece);
      if (!bucket) continue;

      const normalizedCpLoss = normalizeCpLoss(cpLoss);
      gameUsed = true;
      bucket.qualityMoveCount += 1;
      bucket.accuracyTotal += cpLossToAccuracy(normalizedCpLoss);
      bucket.cpLossTotal += normalizedCpLoss;

      if (normalizedCpLoss >= BLUNDER_CP_THRESHOLD) {
        bucket.blunders += 1;
      } else if (normalizedCpLoss >= MISTAKE_CP_THRESHOLD) {
        bucket.mistakes += 1;
      } else if (normalizedCpLoss >= INACCURACY_CP_THRESHOLD) {
        bucket.inaccuracies += 1;
      }
    }

    if (gameUsed) sampleSize += 1;
  }

  const totalClassifiedErrors = Array.from(buckets.values()).reduce(
    (sum, entry) => sum + entry.inaccuracies + entry.mistakes + entry.blunders,
    0,
  );
  const totalAnalyzedMoves = Array.from(buckets.values()).reduce(
    (sum, entry) => sum + entry.qualityMoveCount,
    0,
  );

  const entries: PieceErrorDistributionEntry[] = pieces
    .map((piece) => {
      const bucket = buckets.get(piece) ?? {
        inaccuracies: 0,
        mistakes: 0,
        blunders: 0,
        qualityMoveCount: 0,
        accuracyTotal: 0,
        cpLossTotal: 0,
      };
      const total = bucket.inaccuracies + bucket.mistakes + bucket.blunders;

      return {
        piece,
        inaccuracies: bucket.inaccuracies,
        mistakes: bucket.mistakes,
        blunders: bucket.blunders,
        total,
        moveCount: bucket.qualityMoveCount,
        blunderCount: bucket.blunders,
        blunderRatePct:
          bucket.qualityMoveCount > 0
            ? roundToTenths((bucket.blunders / bucket.qualityMoveCount) * 100)
            : 0,
        accuracyPct:
          bucket.qualityMoveCount > 0
            ? roundToTenths(bucket.accuracyTotal / bucket.qualityMoveCount)
            : null,
        avgCpl:
          bucket.qualityMoveCount > 0
            ? roundToTenths(bucket.cpLossTotal / bucket.qualityMoveCount)
            : null,
        lowSample: bucket.qualityMoveCount < 10,
      };
    })
    .filter((entry) => entry.moveCount > 0)
    .sort((left, right) => {
      if (left.blunderRatePct !== right.blunderRatePct) {
        return right.blunderRatePct - left.blunderRatePct;
      }
      if ((left.avgCpl ?? -1) !== (right.avgCpl ?? -1)) {
        return (right.avgCpl ?? -1) - (left.avgCpl ?? -1);
      }
      if (left.blunderCount !== right.blunderCount) {
        return right.blunderCount - left.blunderCount;
      }
      return left.piece.localeCompare(right.piece);
    });

  return {
    supported: totalAnalyzedMoves > 0,
    sampleSize,
    totalClassifiedErrors,
    pieces: entries,
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

function buildNotes(games: NormalizedGame[]) {
  const notes: string[] = [];

  if (games.some((game) => game.provider === "chesscom")) {
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

function phaseLossToEvalPawns(totalCpLoss: number, sampleSize: number) {
  if (sampleSize === 0) return null;
  return roundToTenths(totalCpLoss / sampleSize / CENTIPAWNS_PER_PAWN);
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

function toPercent(value: number) {
  return Math.round(value * 10) / 10;
}

function roundToTenths(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

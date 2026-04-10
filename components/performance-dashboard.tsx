"use client";

import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import {
  PERFORMANCE_GAME_TYPE_OPTIONS,
  PERFORMANCE_RANGE_OPTIONS,
  getGameTypeLabel,
  getRangeLabel,
  type PerformanceGameType,
  type PerformanceRangeDays,
} from "@/lib/chess-profile";
import {
  buildPerformanceSnapshot,
  type NormalizedGame,
  type OpeningSummary,
  type PieceErrorDistributionSummary,
  type PieceType,
  type PerformanceReport,
  type RatingTrendSummary,
  type RecordSummary,
  type TimeManagementSummary,
} from "@/lib/chess-performance-report";

const INACCURACY_CP_THRESHOLD = 50;
const MISTAKE_CP_THRESHOLD = 100;
const BLUNDER_CP_THRESHOLD = 300;
const CLIENT_ANALYSIS_CHUNK_SIZE = 10;
const CLIENT_ANALYSIS_CACHE_VERSION = 1;

interface ClientAnalyzedGame {
  id: string;
  userMoveCpLosses: Array<number | null>;
  userMovePieceTypes: PieceType[];
  analyzedAt: number;
}

interface ClientProcessingStatus {
  running: boolean;
  processedGames: number;
  totalGames: number;
  etaMinutes: number | null;
}

function filterButtonClass(isActive: boolean) {
  return [
    "inline-flex items-center justify-center border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition",
    isActive
      ? "border-[var(--app-accent)] bg-[var(--app-accent)] text-[var(--app-accent-contrast)]"
      : "border-[var(--app-border)] text-[var(--app-text)] hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]",
  ].join(" ");
}

function formatPercent(value: number | null) {
  if (value === null) return "N/A";
  return `${value.toFixed(1)}%`;
}

function formatRating(value: number | null) {
  if (value === null) return "N/A";
  return Math.round(value).toString();
}

function formatSignedNumber(value: number | null) {
  if (value === null) return "N/A";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function ratingChangeClass(change: number | null) {
  if (change === null) return "text-[var(--app-muted)]";
  if (change > 0) return "text-emerald-300";
  if (change < 0) return "text-rose-300";
  return "text-[var(--app-text)]";
}

function buildAnalysisCacheKey(report: PerformanceReport) {
  return [
    "perf-client-analysis",
    CLIENT_ANALYSIS_CACHE_VERSION,
    report.provider,
    report.username.toLowerCase(),
  ].join(":");
}

function matchesDashboardGameType(game: NormalizedGame, gameType: PerformanceGameType) {
  if (gameType === "all") return true;
  return game.timeType === gameType;
}

function parseMovesUci(movesUci?: string) {
  return movesUci
    ?.split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean) ?? [];
}

function summarizeMostBlunderedPiecesFromGames(
  games: NormalizedGame[],
  analyzedByGame: Record<string, ClientAnalyzedGame>,
): PieceErrorDistributionSummary {
  const pieces: PieceType[] = ["pawn", "knight", "bishop", "rook", "queen", "king"];
  const buckets = new Map<
    PieceType,
    { inaccuracies: number; mistakes: number; blunders: number }
  >(
    pieces.map((piece) => [
      piece,
      { inaccuracies: 0, mistakes: 0, blunders: 0 },
    ]),
  );

  let sampleSize = 0;

  for (const game of games) {
    const analyzed = analyzedByGame[game.id];
    const cpLosses =
      game.userMoveCpLosses.length > 0
        ? game.userMoveCpLosses
        : analyzed?.userMoveCpLosses ?? [];
    const pieceTypes =
      game.userMovePieceTypes && game.userMovePieceTypes.length > 0
        ? game.userMovePieceTypes
        : analyzed?.userMovePieceTypes ?? [];

    if (cpLosses.length === 0 || pieceTypes.length === 0) continue;

    let usedGame = false;
    const loopLength = Math.min(cpLosses.length, pieceTypes.length);

    for (let index = 0; index < loopLength; index += 1) {
      const cpLoss = cpLosses[index];
      const piece = pieceTypes[index];
      if (cpLoss === null || !piece) continue;

      const bucket = buckets.get(piece);
      if (!bucket) continue;

      if (cpLoss >= BLUNDER_CP_THRESHOLD) {
        bucket.blunders += 1;
        usedGame = true;
      } else if (cpLoss >= MISTAKE_CP_THRESHOLD) {
        bucket.mistakes += 1;
        usedGame = true;
      } else if (cpLoss >= INACCURACY_CP_THRESHOLD) {
        bucket.inaccuracies += 1;
        usedGame = true;
      }
    }

    if (usedGame) sampleSize += 1;
  }

  const totalClassifiedErrors = Array.from(buckets.values()).reduce(
    (sum, entry) => sum + entry.inaccuracies + entry.mistakes + entry.blunders,
    0,
  );

  const entries = pieces
    .map((piece) => {
      const bucket = buckets.get(piece) ?? {
        inaccuracies: 0,
        mistakes: 0,
        blunders: 0,
      };
      const total = bucket.inaccuracies + bucket.mistakes + bucket.blunders;

      return {
        piece,
        inaccuracies: bucket.inaccuracies,
        mistakes: bucket.mistakes,
        blunders: bucket.blunders,
        total,
        share:
          totalClassifiedErrors > 0
            ? Math.round((total / totalClassifiedErrors) * 1000) / 10
            : 0,
      };
    })
    .filter((entry) => entry.total > 0)
    .sort((left, right) => {
      if (left.total !== right.total) return right.total - left.total;
      if (left.blunders !== right.blunders) return right.blunders - left.blunders;
      if (left.mistakes !== right.mistakes) return right.mistakes - left.mistakes;
      return left.piece.localeCompare(right.piece);
    });

  return {
    supported: totalClassifiedErrors > 0,
    sampleSize,
    totalClassifiedErrors,
    pieces: entries,
  };
}

function formatEtaMinutes(value: number | null) {
  if (value === null) return "estimating";
  if (value <= 0.1) return "< 0.1";
  return value.toFixed(1);
}

function renderRecordCard(title: string, summary: RecordSummary) {
  return (
    <article key={title} className="app-brutal-card p-6">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--app-muted)]">
        {title}
      </p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-bold text-white">{formatPercent(summary.winRate)}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold text-emerald-300">{summary.wins}W</span>
            <span className="text-[var(--app-muted)]">/</span>
            <span className="font-bold text-[var(--app-muted)]">{summary.draws}D</span>
            <span className="text-[var(--app-muted)]">/</span>
            <span className="font-bold text-rose-300">{summary.losses}L</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--app-muted)]">
            Score Rate
          </p>
          <p className="mt-2 text-lg font-bold text-white">
            {formatPercent(summary.scoreRate)}
          </p>
        </div>
      </div>
      <p className="mt-4 text-xs uppercase tracking-[0.16em] text-[var(--app-muted-soft)]">
        {summary.games} game{summary.games === 1 ? "" : "s"}
      </p>
    </article>
  );
}

function renderRatingTrend(summary: RatingTrendSummary) {
  if (!summary.supported) {
    return (
      <article className="app-brutal-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-white">
            Rating Trend
          </h2>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
            Filtered Period
          </p>
        </div>
        <p className="mt-5 text-sm leading-7 text-[var(--app-muted)]">
          No rating samples were available for this provider and filter window yet.
        </p>
      </article>
    );
  }

  const width = 920;
  const height = 250;
  const paddingX = 32;
  const paddingY = 20;
  const minRating = summary.low ?? 0;
  const maxRating = summary.high ?? 0;
  const ratingRange = Math.max(1, maxRating - minRating);
  const horizontalSpace = width - paddingX * 2;
  const verticalSpace = height - paddingY * 2;
  const points = summary.points.map((point, index) => {
    const x =
      summary.points.length === 1
        ? width / 2
        : paddingX + (horizontalSpace * index) / (summary.points.length - 1);
    const y =
      paddingY + ((maxRating - point.rating) / ratingRange) * verticalSpace;

    return {
      ...point,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
    };
  });
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPolyline = [
    `${paddingX},${height - paddingY}`,
    polyline,
    `${width - paddingX},${height - paddingY}`,
  ].join(" ");
  const startPoint = summary.points[0];
  const endPoint = summary.points[summary.points.length - 1];
  const guideRatings = Array.from({ length: 4 }, (_, index) =>
    Math.round(maxRating - (ratingRange * index) / 3),
  );

  return (
    <article className="app-brutal-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-white">
          Rating Trend
        </h2>
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
          Filtered Period
        </p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        <div className="app-brutal-inset p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
            Start
          </p>
          <p className="mt-3 text-3xl font-bold text-white">
            {formatRating(summary.start)}
          </p>
        </div>
        <div className="app-brutal-inset p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
            Current
          </p>
          <p className="mt-3 text-3xl font-bold text-white">
            {formatRating(summary.current)}
          </p>
        </div>
        <div className="app-brutal-inset p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
            Change
          </p>
          <p className={`mt-3 text-3xl font-bold ${ratingChangeClass(summary.change)}`}>
            {formatSignedNumber(summary.change)}
          </p>
        </div>
        <div className="app-brutal-inset p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
            High / Low
          </p>
          <p className="mt-3 text-3xl font-bold text-white">
            {formatRating(summary.high)}
          </p>
          <p className="mt-2 text-sm text-[var(--app-muted)]">
            Low {formatRating(summary.low)}
          </p>
        </div>
      </div>

      <div className="app-brutal-inset mt-5 p-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-[250px] w-full"
          role="img"
          aria-label="Rating over time"
        >
          {guideRatings.map((rating) => {
            const y =
              paddingY + ((maxRating - rating) / ratingRange) * verticalSpace;

            return (
              <g key={rating}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="var(--app-chart-grid)"
                  strokeWidth="1"
                />
                <text
                  x={paddingX - 10}
                  y={y + 4}
                  fill="var(--app-muted)"
                  fontSize="11"
                  textAnchor="end"
                >
                  {rating}
                </text>
              </g>
            );
          })}

          <polyline
            points={areaPolyline}
            fill="var(--app-chart-fill)"
            stroke="none"
          />
          <polyline
            points={polyline}
            fill="none"
            stroke="var(--app-accent)"
            strokeWidth="3"
          />

          {points.map((point, index) => (
            <circle
              key={`${point.timestamp}-${index}`}
              cx={point.x}
              cy={point.y}
              r="4"
              fill={
                index === points.length - 1
                  ? "var(--app-chart-current-point)"
                  : "var(--app-panel-solid)"
              }
              stroke="var(--app-text)"
              strokeWidth="1.5"
            />
          ))}
        </svg>

        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-[var(--app-muted)]">
          <span>{startPoint?.label ?? "Start"}</span>
          <span>{endPoint?.label ?? "End"}</span>
        </div>
      </div>
    </article>
  );
}

function renderOpeningTreeNode(
  opening: OpeningSummary,
  depth = 0,
  branch: "root" | "middle" | "last" = "root",
): JSX.Element {
  const isChild = depth > 0;
  const rowKey = `${depth}-${opening.code ?? "na"}-${opening.name}`;
  const hasChildren = opening.children && opening.children.length > 0;
  const childOffset = isChild ? 52 : 0; // 52px = 3.25rem

  return (
    <div key={rowKey} className="relative">
      {isChild && (
        <span
          aria-hidden="true"
          className={`absolute left-0 w-px bg-[var(--app-border-strong)]/80 ${
            branch === "last" ? "top-0 h-6" : "top-0 bottom-0"
          }`}
        />
      )}

      {isChild && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-6 h-px w-10 bg-[var(--app-border-strong)]/80"
        />
      )}

      <div style={{ marginLeft: childOffset }}>
        <div className="border border-[var(--app-border)] bg-[var(--app-panel-solid)]/40 px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-white">
                {opening.name}
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--app-muted)]">
                {opening.code ?? "No ECO"} • {opening.games} game
                {opening.games === 1 ? "" : "s"}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-xs font-bold text-white">
                {formatPercent(opening.scoreRate)}
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--app-muted)]">
                {opening.wins}-{opening.draws}-{opening.losses}
              </p>
            </div>
          </div>
        </div>

        {hasChildren && (
          <div className="relative mt-3 ps-10">
            <div className="space-y-3">
              {opening.children!.map((child, childIndex) =>
                renderOpeningTreeNode(
                  child,
                  depth + 1,
                  childIndex === opening.children!.length - 1 ? "last" : "middle",
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function renderOpeningTree(openings: OpeningSummary[]) {
  return openings.map((opening, openingIndex) => (
    <div
      key={`${opening.code ?? "na"}-${opening.name}-${openingIndex}`}
      className={openingIndex > 0 ? "border-t border-[var(--app-border)]/50 pt-4" : ""}
    >
      {renderOpeningTreeNode(opening)}
    </div>
  ));
}

function renderOpeningList(title: string, openings: OpeningSummary[], emptyCopy: string) {
  return (
    <div className="app-brutal-inset p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">
          {title}
        </h3>
        <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--app-muted)]">
          Top 5
        </span>
      </div>
      {openings.length > 0 ? (
        <div className="mt-5 space-y-5">{renderOpeningTree(openings)}</div>
      ) : (
        <p className="mt-5 text-sm leading-7 text-[var(--app-muted)]">{emptyCopy}</p>
      )}
    </div>
  );
}

function renderTimeManagementColumn(title: string, summary: TimeManagementSummary) {
  return (
    <div className="app-brutal-inset p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-white">{title}</p>
      <dl className="mt-4 grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[var(--app-muted)]">Good Think</dt>
          <dd className="font-bold text-white">{formatPercent(summary.goodThink)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[var(--app-muted)]">Wasted</dt>
          <dd className="font-bold text-white">{formatPercent(summary.wasted)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[var(--app-muted)]">Fast Blunder</dt>
          <dd className="font-bold text-white">{formatPercent(summary.fastBlunder)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[var(--app-muted)]">Efficiency</dt>
          <dd className="font-bold text-white">{formatPercent(summary.efficiency)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[var(--app-muted)]">Slow/Fast</dt>
          <dd className="font-bold text-white">
            {summary.slowMoves}/{summary.fastMoves}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-xs uppercase tracking-[0.16em] text-[var(--app-muted-soft)]">
        {summary.sampleSize} live game{summary.sampleSize === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function getPieceLabel(piece: PieceType) {
  switch (piece) {
    case "pawn":
      return "Pawn";
    case "knight":
      return "Knight";
    case "bishop":
      return "Bishop";
    case "rook":
      return "Rook";
    case "queen":
      return "Queen";
    case "king":
      return "King";
    default:
      return piece;
  }
}

function renderMostBlunderedPieces(
  summary: PieceErrorDistributionSummary,
  processing: ClientProcessingStatus,
) {
  return (
    <article className="app-brutal-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-white">
          Most Blundered Pieces
        </h2>
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
          Inaccuracy 50+ cp, Mistake 100+ cp, Blunder 300+ cp
        </p>
      </div>
      {processing.running ? (
        <p className="mt-4 text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
          Processing past games. ETA: {formatEtaMinutes(processing.etaMinutes)} minutes.
          Progress {processing.processedGames}/{processing.totalGames}. Updating every{" "}
          {CLIENT_ANALYSIS_CHUNK_SIZE} games.
        </p>
      ) : null}
      {summary.supported ? (
        <div className="mt-5 grid gap-3">
          {summary.pieces.map((entry) => (
            <div key={entry.piece} className="app-brutal-inset p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-white">{getPieceLabel(entry.piece)}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
                  {entry.total} errors ({entry.share.toFixed(1)}%)
                </p>
              </div>
              <div className="mt-3 h-2 w-full bg-[var(--app-panel-solid)]">
                <div
                  className="h-2 bg-[var(--app-accent)]"
                  style={{ width: `${Math.max(4, entry.share)}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[var(--app-muted)]">
                <span>Inaccuracies: {entry.inaccuracies}</span>
                <span>Mistakes: {entry.mistakes}</span>
                <span>Blunders: {entry.blunders}</span>
              </div>
            </div>
          ))}
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted-soft)]">
            {summary.totalClassifiedErrors} classified errors across {summary.sampleSize} game
            {summary.sampleSize === 1 ? "" : "s"}
          </p>
        </div>
      ) : (
        <p className="mt-5 text-sm leading-7 text-[var(--app-muted)]">
          {processing.running
            ? `Processing past games. ETA: ${formatEtaMinutes(processing.etaMinutes)} minutes.`
            : "No move-by-move eval and piece data matched this filter yet."}
        </p>
      )}
    </article>
  );
}

export function PerformanceDashboard({
  report,
  initialRangeDays,
  initialGameType,
}: {
  report: PerformanceReport;
  initialRangeDays: PerformanceRangeDays;
  initialGameType: PerformanceGameType;
}) {
  const [rangeDays, setRangeDays] = useState(initialRangeDays);
  const [gameType, setGameType] = useState(initialGameType);
  const [clientAnalyzedByGame, setClientAnalyzedByGame] = useState<
    Record<string, ClientAnalyzedGame>
  >({});
  const [processingStatus, setProcessingStatus] = useState<ClientProcessingStatus>({
    running: false,
    processedGames: 0,
    totalGames: 0,
    etaMinutes: null,
  });
  const workerRef = useRef<Worker | null>(null);

  const snapshot = buildPerformanceSnapshot(report, { rangeDays, gameType });
  const analysisCacheKey = useMemo(() => buildAnalysisCacheKey(report), [report]);
  const filteredGames = useMemo(
    () =>
      report.games
        .filter((game) => game.endTimeMs >= Date.now() - rangeDays * 24 * 60 * 60 * 1000)
        .filter((game) => matchesDashboardGameType(game, gameType))
        .sort((left, right) => right.endTimeMs - left.endTimeMs),
    [gameType, rangeDays, report.games],
  );

  const pendingClientAnalysisGames = useMemo(() => {
    return filteredGames
      .filter((game) => game.userMoveCpLosses.length === 0)
      .filter(
        (game) =>
          parseMovesUci(game.movesUci).length > 0 ||
          typeof game.pgn === "string",
      )
      .filter((game) => !clientAnalyzedByGame[game.id]);
  }, [clientAnalyzedByGame, filteredGames]);

  const mostBlunderedPiecesSummary = useMemo(
    () => summarizeMostBlunderedPiecesFromGames(filteredGames, clientAnalyzedByGame),
    [clientAnalyzedByGame, filteredGames],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(analysisCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        entries?: Record<string, ClientAnalyzedGame>;
      };
      if (!parsed || typeof parsed !== "object" || !parsed.entries) return;
      setClientAnalyzedByGame(parsed.entries);
    } catch {
      // Corrupt local cache should not block the dashboard.
    }
  }, [analysisCacheKey]);

  useEffect(() => {
    if (pendingClientAnalysisGames.length === 0) {
      setProcessingStatus((current) => ({
        ...current,
        running: false,
        processedGames: 0,
        totalGames: 0,
        etaMinutes: null,
      }));
      return;
    }

    if (workerRef.current) return;

    const worker = new Worker(
      new URL("./workers/performance-analysis.worker.ts", import.meta.url),
    );
    workerRef.current = worker;

    setProcessingStatus({
      running: true,
      processedGames: 0,
      totalGames: pendingClientAnalysisGames.length,
      etaMinutes: null,
    });

    worker.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data as
        | {
            type: "chunk";
            processedGames: number;
            totalGames: number;
            etaMinutes: number;
            chunk: Array<{
              id: string;
              userMoveCpLosses: Array<number | null>;
              userMovePieceTypes: PieceType[];
            }>;
          }
        | { type: "done"; processedGames: number; totalGames: number }
        | { type: "error"; message: string };

      if (data.type === "chunk") {
        setProcessingStatus({
          running: true,
          processedGames: data.processedGames,
          totalGames: data.totalGames,
          etaMinutes: data.etaMinutes,
        });

        if (data.chunk.length > 0) {
          setClientAnalyzedByGame((current) => {
            const next = { ...current };
            const analyzedAt = Date.now();

            data.chunk.forEach((entry) => {
              next[entry.id] = {
                id: entry.id,
                userMoveCpLosses: entry.userMoveCpLosses,
                userMovePieceTypes: entry.userMovePieceTypes,
                analyzedAt,
              };
            });

            try {
              localStorage.setItem(
                analysisCacheKey,
                JSON.stringify({ entries: next }),
              );
            } catch {
              // Best-effort cache only.
            }

            return next;
          });
        }

        return;
      }

      if (data.type === "done") {
        setProcessingStatus({
          running: false,
          processedGames: data.processedGames,
          totalGames: data.totalGames,
          etaMinutes: 0,
        });
        worker.terminate();
        workerRef.current = null;
        return;
      }

      if (data.type === "error") {
        setProcessingStatus({
          running: false,
          processedGames: 0,
          totalGames: pendingClientAnalysisGames.length,
          etaMinutes: null,
        });
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.postMessage({
      type: "start",
      games: pendingClientAnalysisGames.map((game) => ({
        id: game.id,
        userColor: game.userColor,
        movesUci: game.movesUci,
        pgn: game.pgn,
        userMovePieceTypes: game.userMovePieceTypes,
      })),
      chunkSize: CLIENT_ANALYSIS_CHUNK_SIZE,
      movetimeMs: 35,
      idleBetweenMovesMs: 75,
      idleBetweenGamesMs: 250,
    });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [analysisCacheKey, pendingClientAnalysisGames]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("range", String(rangeDays));
    params.set("type", gameType);
    const nextUrl = `/performance?${params.toString()}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [gameType, rangeDays]);

  useEffect(() => {
    void fetch("/api/performance/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rangeDays,
        gameType,
      }),
    }).catch(() => {
      // Filter persistence is best-effort; the dashboard should remain usable offline.
    });
  }, [gameType, rangeDays]);

  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-6">
      <div className="app-brutal-card-strong p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--app-muted)]">
              Statistics
            </p>
            <h1 className="mt-3 text-3xl font-bold uppercase tracking-[0.16em] text-white">
              {report.username}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--app-muted)]">
              Pulling standard {snapshot.providerLabel} games from the last{" "}
              {getRangeLabel(rangeDays).toLowerCase()} and filtering for{" "}
              {getGameTypeLabel(gameType).toLowerCase()} time controls.
            </p>
          </div>

          <div className="app-brutal-inset grid gap-3 p-5 text-sm text-[var(--app-muted)]">
            <p>
              Provider: <span className="font-bold text-white">{snapshot.providerLabel}</span>
            </p>
            <p>
              Cached games:{" "}
              <span className="font-bold text-white">{snapshot.totalFetchedGames}</span>
            </p>
            <p>
              Matching filter:{" "}
              <span className="font-bold text-white">{snapshot.totalFilteredGames}</span>
            </p>
            <p>
              Total played:{" "}
              <span className="font-bold text-white">
                {report.totalGameCount ?? "Unknown"}
              </span>
            </p>
            <a
              href={snapshot.profileUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-accent)] transition hover:text-white"
            >
              View Public Profile
            </a>
          </div>
        </div>

        <div className="mt-8 grid gap-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--app-muted)]">
              Date Range
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PERFORMANCE_RANGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRangeDays(option)}
                  className={filterButtonClass(rangeDays === option)}
                >
                  {getRangeLabel(option)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--app-muted)]">
              Game Type
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PERFORMANCE_GAME_TYPE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setGameType(option)}
                  className={filterButtonClass(gameType === option)}
                >
                  {getGameTypeLabel(option)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {snapshot.notes.length > 0 ? (
        <div className="grid gap-3">
          {snapshot.notes.map((note) => (
            <div
              key={note}
              className="app-brutal-inset px-5 py-4 text-sm leading-6 text-[var(--app-muted)]"
            >
              {note}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {renderRecordCard("All Colors", snapshot.winRates.overall)}
        {renderRecordCard("With White", snapshot.winRates.white)}
        {renderRecordCard("With Black", snapshot.winRates.black)}
      </div>

      {renderRatingTrend(snapshot.ratingTrend)}

      <article className="app-brutal-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-white">
            Most Played Openings
          </h2>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
            Performance of the top 5 most played openings as white and black
          </p>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {renderOpeningList(
            "As White",
            snapshot.openings.white,
            "Play a few white games in this filter window and your most-played openings will appear here.",
          )}
          {renderOpeningList(
            "As Black",
            snapshot.openings.black,
            "Play a few black games in this filter window and your most-played openings will appear here.",
          )}
        </div>
      </article>

      <article className="app-brutal-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-white">
            Time Management
          </h2>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
            Heuristic from public move clocks
          </p>
        </div>
        {snapshot.timeManagement.supported ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {renderTimeManagementColumn("You", snapshot.timeManagement.user)}
            {renderTimeManagementColumn("Opp", snapshot.timeManagement.opponent)}
          </div>
        ) : (
          <p className="mt-5 text-sm leading-7 text-[var(--app-muted)]">
            No live-clock games with usable move times matched this filter yet.
          </p>
        )}
      </article>

      {renderMostBlunderedPieces(mostBlunderedPiecesSummary, processingStatus)}
    </div>
  );
}

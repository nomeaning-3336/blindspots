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
} from "@/lib/chess-performance-report";
import {
  BLUNDER_CP_THRESHOLD,
  INACCURACY_CP_THRESHOLD,
  MISTAKE_CP_THRESHOLD,
  cpLossToAccuracy,
  normalizeCpLoss,
  type ThinkTimeBucketSummary,
  type TimeManagementSideSummary,
} from "@/lib/performance-time-management";
import {
  CLIENT_ANALYSIS_IDLE_BETWEEN_GAMES_MS,
  CLIENT_ANALYSIS_IDLE_BETWEEN_MOVES_MS,
  CLIENT_ANALYSIS_ENGINE_INIT_TIMEOUT_MS,
  CLIENT_ANALYSIS_EVALUATION_TIMEOUT_MS,
  CLIENT_ANALYSIS_MAX_GAMES,
  CLIENT_ANALYSIS_MOVETIME_MS,
  applyClientAnalysisDone,
  applyClientAnalysisError,
  applyClientAnalysisProgress,
  buildAnalysisCacheKey,
  createIdleClientProcessingStatus,
  createStartingClientProcessingStatus,
  mergeClientAnalysisEntries,
  parseClientAnalysisCache,
  serializeClientAnalysisCache,
  selectPendingClientAnalysisGames,
  type ClientAnalyzedGame,
  type ClientAnalysisWorkerMessage,
  type ClientProcessingStatus,
} from "@/lib/performance-client-analysis";

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

function formatCpl(value: number | null) {
  if (value === null) return "N/A";
  return value.toFixed(1);
}

function renderMetricHelp(text: string) {
  return (
    <span
      title={text}
      className="inline-flex h-5 w-5 items-center justify-center border border-[var(--app-border)] text-[10px] font-bold text-[var(--app-muted)]"
      aria-label={text}
    >
      ?
    </span>
  );
}

function summarizeBestThinkZone(summary: TimeManagementSideSummary) {
  const bestBucket = summary.bestThinkZone;
  if (!bestBucket) {
    return {
      value: "Quality unavailable",
      detail: "Need move-by-move eval data to compare which time zone performs best.",
    };
  }

  if (summary.bestThinkZoneSignal === "accuracy" && bestBucket.accuracyPct !== null) {
    return {
      value: bestBucket.label,
      detail: `Best average move accuracy: ${formatPercent(bestBucket.accuracyPct)}.`,
    };
  }

  if (summary.bestThinkZoneSignal === "avgCpl" && bestBucket.avgCpl !== null) {
    return {
      value: bestBucket.label,
      detail: `Lowest average centipawn loss: ${formatCpl(bestBucket.avgCpl)} CPL.`,
    };
  }

  return {
    value: "Quality unavailable",
    detail: "Need move-by-move eval data to compare which time zone performs best.",
  };
}

function summarizeRushErrors(summary: TimeManagementSideSummary) {
  if (summary.rushErrorRatePct === null) {
    return {
      value: "No errors logged",
      detail: "No mistakes or blunders were recorded in the available quality data.",
    };
  }

  return {
    value: formatPercent(summary.rushErrorRatePct),
    detail: "Share of all mistakes and blunders that happened in the 0-5 second bucket.",
  };
}

function summarizeLongThinkPayoff(summary: TimeManagementSideSummary) {
  const longThinkBucket = summary.buckets.find((bucket) => bucket.key === "30plus");
  if ((longThinkBucket?.moveCount ?? 0) === 0) {
    return {
      value: "No 30s+ moves",
      detail: "This side did not have any moves in the 30 seconds or longer bucket.",
    };
  }

  if (summary.longThinkPayoffPct === null) {
    return {
      value: "Quality unavailable",
      detail: "Long-think payoff needs move-by-move eval data for the 30s+ bucket.",
    };
  }

  return {
    value: formatPercent(summary.longThinkPayoffPct),
    detail: "Share of 30s+ moves that beat this side's own overall quality baseline.",
  };
}

function ratingChangeClass(change: number | null) {
  if (change === null) return "text-[var(--app-muted)]";
  if (change > 0) return "text-emerald-300";
  if (change < 0) return "text-rose-300";
  return "text-[var(--app-text)]";
}

function resolveInitialProfileKeys(
  report: PerformanceReport,
  initialProfileKeys: string[],
) {
  const availableProfileKeys = report.profiles.map((profile) => profile.key);
  if (!initialProfileKeys.length) return availableProfileKeys;

  const allowedKeys = new Set(availableProfileKeys);
  const normalized = Array.from(
    new Set(initialProfileKeys.filter((key) => allowedKeys.has(key))),
  );

  return normalized.length > 0
    ? availableProfileKeys.filter((key) => normalized.includes(key))
    : availableProfileKeys;
}

function toggleProfileSelection(
  current: string[],
  key: string,
  allProfileKeys: string[],
) {
  const next = new Set(current.length > 0 ? current : allProfileKeys);

  if (next.has(key)) {
    if (next.size === 1) return current;
    next.delete(key);
  } else {
    next.add(key);
  }

  return allProfileKeys.filter((candidate) => next.has(candidate));
}

function buildPerformanceTitle(
  selectedProfiles: PerformanceReport["profiles"],
  totalLinkedProfiles: number,
) {
  if (selectedProfiles.length === 1) {
    return selectedProfiles[0]?.username ?? "Performance";
  }

  if (selectedProfiles.length === totalLinkedProfiles) {
    return "All Linked Accounts";
  }

  if (selectedProfiles.length > 1) {
    return `${selectedProfiles.length} Linked Accounts`;
  }

  return "Performance";
}

function buildPerformanceSubtitle(
  selectedProfiles: PerformanceReport["profiles"],
  totalLinkedProfiles: number,
  rangeDays: PerformanceRangeDays,
  gameType: PerformanceGameType,
) {
  if (selectedProfiles.length === 1) {
    return `Pulling standard ${selectedProfiles[0]?.providerLabel ?? "linked"} games from the last ${getRangeLabel(rangeDays).toLowerCase()} and filtering for ${getGameTypeLabel(gameType).toLowerCase()} time controls.`;
  }

  const accountCount =
    selectedProfiles.length === totalLinkedProfiles
      ? "all linked accounts"
      : `${selectedProfiles.length} linked accounts`;

  return `Pulling standard games from ${accountCount} over the last ${getRangeLabel(rangeDays).toLowerCase()} and filtering for ${getGameTypeLabel(gameType).toLowerCase()} time controls.`;
}

function matchesDashboardGameType(game: NormalizedGame, gameType: PerformanceGameType) {
  if (gameType === "all") return true;
  return game.timeType === gameType;
}

function summarizeMostBlunderedPiecesFromGames(
  games: NormalizedGame[],
  analyzedByGame: Record<string, ClientAnalyzedGame>,
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

      const normalizedCpLoss = normalizeCpLoss(cpLoss);
      usedGame = true;
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

    if (usedGame) sampleSize += 1;
  }

  const totalClassifiedErrors = Array.from(buckets.values()).reduce(
    (sum, entry) => sum + entry.inaccuracies + entry.mistakes + entry.blunders,
    0,
  );
  const totalAnalyzedMoves = Array.from(buckets.values()).reduce(
    (sum, entry) => sum + entry.qualityMoveCount,
    0,
  );

  const entries = pieces
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
            ? Math.round((bucket.blunders / bucket.qualityMoveCount) * 1000) / 10
            : 0,
        accuracyPct:
          bucket.qualityMoveCount > 0
            ? Math.round((bucket.accuracyTotal / bucket.qualityMoveCount) * 10) / 10
            : null,
        avgCpl:
          bucket.qualityMoveCount > 0
            ? Math.round((bucket.cpLossTotal / bucket.qualityMoveCount) * 10) / 10
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

function formatEtaMinutes(value: number | null) {
  if (value === null) return "estimating";
  if (value <= 0.1) return "< 0.1";
  return value.toFixed(1);
}

function describeClientAnalysisProgress(status: ClientProcessingStatus) {
  if (
    status.phase === "done" &&
    status.processedGames > 0 &&
    status.failedGames === status.processedGames
  ) {
    return "Recent-game analysis finished, but none of the sampled games could be enriched locally.";
  }

  if (status.phase === "done" && status.failedGames > 0) {
    return "Recent-game analysis finished with some skipped or timed-out games.";
  }

  if (status.reason === "starting-engine") {
    return "Analyzing recent games. Starting the local engine.";
  }

  if (status.currentGameIndex !== null && status.totalGames > 0) {
    const gameLabel = `Game ${status.currentGameIndex} of ${status.totalGames}`;
    if (status.currentMoveIndex !== null && status.currentMoveCount !== null) {
      return `Analyzing recent games. ${gameLabel}, move ${status.currentMoveIndex} of ${status.currentMoveCount}.`;
    }
    return `Analyzing recent games. ${gameLabel}.`;
  }

  return "Analyzing recent games.";
}

function describeClientAnalysisFallback(
  status: ClientProcessingStatus,
  hasSummary: boolean,
) {
  if (status.phase === "error" && hasSummary) {
    return status.errorMessage
      ? `${status.errorMessage} Showing partial results from the games that were processed.`
      : "Client enrichment stopped early. Showing partial results from the games that were processed.";
  }

  if (status.phase === "done" && status.failedGames > 0 && hasSummary) {
    return "Showing the results that were available. Some recent games could not be enriched locally.";
  }

  if (
    status.phase === "done" &&
    status.processedGames > 0 &&
    status.failedGames === status.processedGames
  ) {
    return "The recent-game sample could not be enriched locally right now.";
  }

  if (status.phase === "done" && status.failedGames > 0) {
    return "Move-by-move piece error analysis is unavailable right now.";
  }

  if (status.phase === "error") {
    return status.errorMessage ?? "Move-by-move piece error analysis is unavailable right now.";
  }

  return "No move-by-move eval and piece data matched this filter yet.";
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
          {guideRatings.map((rating, index) => {
            const y =
              paddingY + ((maxRating - rating) / ratingRange) * verticalSpace;

            return (
              <g key={`guide-${index}-${rating}`}>
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

function renderTimeManagementColumn(title: string, summary: TimeManagementSideSummary) {
  const bestThinkZone = summarizeBestThinkZone(summary);
  const rushErrors = summarizeRushErrors(summary);
  const longThinkPayoff = summarizeLongThinkPayoff(summary);

  if (!summary.supported) {
    return (
      <div className="app-brutal-inset p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white">{title}</p>
        <p className="mt-4 text-sm leading-7 text-[var(--app-muted)]">
          No usable move clocks were available for this side in the current filter.
        </p>
      </div>
    );
  }

  return (
    <div className="app-brutal-inset p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white">{title}</p>
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--app-muted)]">
          {summary.totalMoves} clocked move{summary.totalMoves === 1 ? "" : "s"}
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="border border-[var(--app-border)] bg-[var(--app-panel-solid)]/35 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--app-muted)]">
              Best Think-Time Zone
            </p>
            {renderMetricHelp(
              "The bucket with the strongest move quality. We rank buckets by average move accuracy when eval data exists, then by lower average centipawn loss, with move count as the tiebreaker.",
            )}
          </div>
          <p className="mt-3 text-lg font-bold text-white">{bestThinkZone.value}</p>
          <p className="mt-2 text-xs leading-6 text-[var(--app-muted)]">
            {bestThinkZone.detail}
          </p>
        </div>

        <div className="border border-[var(--app-border)] bg-[var(--app-panel-solid)]/35 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--app-muted)]">
              Rush Error Rate
            </p>
            {renderMetricHelp(
              "Share of all mistakes and blunders that happened in the 0-5 second bucket. Higher means this side's errors are clustering in rushed moves.",
            )}
          </div>
          <p className="mt-3 text-lg font-bold text-white">{rushErrors.value}</p>
          <p className="mt-2 text-xs leading-6 text-[var(--app-muted)]">
            {rushErrors.detail}
          </p>
        </div>

        <div className="border border-[var(--app-border)] bg-[var(--app-panel-solid)]/35 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--app-muted)]">
              Long-Think Payoff
            </p>
            {renderMetricHelp(
              "Among 30s+ moves with eval data, the share that beat this side's own overall quality baseline. Lower values suggest that longer thinks are not consistently paying off.",
            )}
          </div>
          <p className="mt-3 text-lg font-bold text-white">{longThinkPayoff.value}</p>
          <p className="mt-2 text-xs leading-6 text-[var(--app-muted)]">
            {longThinkPayoff.detail}
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-[var(--app-border)]/70 text-left uppercase tracking-[0.16em] text-[var(--app-muted)]">
              <th className="py-2 pr-4 font-bold">Think Time</th>
              <th className="py-2 pr-4 font-bold">Moves</th>
              <th className="py-2 pr-4 font-bold">Share</th>
              <th className="py-2 pr-4 font-bold">Accuracy</th>
              <th className="py-2 pr-4 font-bold">Blunder</th>
              <th className="py-2 pr-4 font-bold">Mistake</th>
              <th className="py-2 font-bold">Avg CPL</th>
            </tr>
          </thead>
          <tbody>
            {summary.buckets.map((bucket: ThinkTimeBucketSummary) => {
              const isBestBucket = summary.bestThinkZone?.key === bucket.key;

              return (
                <tr
                  key={bucket.key}
                  className={`border-b border-[var(--app-border)]/40 ${
                    isBestBucket ? "bg-[var(--app-accent)]/8" : ""
                  }`}
                >
                  <td className="py-3 pr-4 font-bold text-white">{bucket.label}</td>
                  <td className="py-3 pr-4 text-[var(--app-text)]">{bucket.moveCount}</td>
                  <td className="py-3 pr-4 text-[var(--app-text)]">
                    {formatPercent(bucket.moveSharePct)}
                  </td>
                  <td className="py-3 pr-4 text-[var(--app-text)]">
                    {formatPercent(bucket.accuracyPct)}
                  </td>
                  <td className="py-3 pr-4 text-[var(--app-text)]">
                    {formatPercent(bucket.blunderRatePct)}
                  </td>
                  <td className="py-3 pr-4 text-[var(--app-text)]">
                    {formatPercent(bucket.mistakeRatePct)}
                  </td>
                  <td className="py-3 text-[var(--app-text)]">{formatCpl(bucket.avgCpl)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-2 text-xs leading-6 text-[var(--app-muted)]">
        <p>
          {summary.sampleSize} live game{summary.sampleSize === 1 ? "" : "s"} contributed
          usable clock data.
        </p>
        {summary.excludedMoveCount > 0 ? (
          <p>
            {summary.excludedMoveCount} move{summary.excludedMoveCount === 1 ? "" : "s"}{" "}
            were excluded because the clock was missing or unusable.
          </p>
        ) : null}
        {summary.qualitySampleSize > 0 && summary.qualitySampleSize < summary.totalMoves ? (
          <p>
            Quality metrics were available on {summary.qualitySampleSize} of{" "}
            {summary.totalMoves} clocked moves.
          </p>
        ) : null}
        {summary.qualitySampleSize === 0 ? (
          <p>
            Move-quality columns need per-move eval data, so this side currently only
            shows clock distribution.
          </p>
        ) : null}
      </div>
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
  const hasSummary = summary.supported;
  const shouldShowProgress =
    processing.running || (processing.phase === "done" && processing.failedGames > 0);
  const shouldShowEta = processing.running && processing.etaMinutes !== null;
  const analyzedMoveCount = summary.pieces.reduce(
    (sum, entry) => sum + entry.moveCount,
    0,
  );

  return (
    <article className="app-brutal-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-white">
          Most Blunder-Prone Pieces
        </h2>
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
          Sorted by blunder rate per piece type
        </p>
      </div>
      {shouldShowProgress ? (
        <div className="mt-4 grid gap-2 text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
          <p>{describeClientAnalysisProgress(processing)}</p>
          <p>
            Progress {processing.processedGames}/{processing.totalGames}
            {processing.failedGames > 0 ? ` • ${processing.failedGames} failed` : ""}
            {shouldShowEta
              ? ` • ETA ${formatEtaMinutes(processing.etaMinutes)} minutes`
              : ""}
          </p>
          <p>Client enrichment is capped to the {CLIENT_ANALYSIS_MAX_GAMES} most recent games.</p>
        </div>
      ) : null}
      {hasSummary ? (
        <div className="mt-5 grid gap-3">
          {summary.pieces.map((entry) => {
            const barWidth =
              entry.blunderRatePct > 0
                ? Math.min(100, Math.max(3, entry.blunderRatePct))
                : 0;

            return (
            <div key={entry.piece} className="app-brutal-inset p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-white">{getPieceLabel(entry.piece)}</p>
                  {entry.lowSample ? (
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">
                      Low Sample
                    </span>
                  ) : null}
                </div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
                  {formatPercent(entry.blunderRatePct)} blunder rate / {formatCpl(entry.avgCpl)} CPL
                </p>
              </div>
              <div className="mt-3 h-2 w-full bg-[var(--app-panel-solid)]">
                <div
                  className="h-2 bg-[var(--app-accent)]"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[var(--app-muted)]">
                <span>
                  {entry.blunderCount} blunder{entry.blunderCount === 1 ? "" : "s"} across{" "}
                  {entry.moveCount} analyzed move{entry.moveCount === 1 ? "" : "s"}
                </span>
                {entry.lowSample ? (
                  <span>Low sample: fewer than 10 analyzed moves</span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--app-muted)]">
                <span>Inaccuracies: {entry.inaccuracies}</span>
                <span>Mistakes: {entry.mistakes}</span>
                <span>Blunders: {entry.blunders}</span>
              </div>
            </div>
          )})}
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted-soft)]">
            {summary.totalClassifiedErrors} moves flagged as inaccuracy, mistake, or
            blunder across {summary.sampleSize} in-range game
            {summary.sampleSize === 1 ? "" : "s"} with analyzed move quality
          </p>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted-soft)]">
            {analyzedMoveCount} analyzed move{analyzedMoveCount === 1 ? "" : "s"} contributed
            to this ranking. Client enrichment stays capped to the{" "}
            {CLIENT_ANALYSIS_MAX_GAMES} most recent games that need local eval data.
          </p>
        </div>
      ) : (
        <p className="mt-5 text-sm leading-7 text-[var(--app-muted)]">
          {describeClientAnalysisFallback(processing, hasSummary)}
        </p>
      )}
    </article>
  );
}

export function PerformanceDashboard({
  report,
  initialRangeDays,
  initialGameType,
  initialProfileKeys,
}: {
  report: PerformanceReport;
  initialRangeDays: PerformanceRangeDays;
  initialGameType: PerformanceGameType;
  initialProfileKeys: string[];
}) {
  const [rangeDays, setRangeDays] = useState(initialRangeDays);
  const [gameType, setGameType] = useState(initialGameType);
  const [selectedProfileKeys, setSelectedProfileKeys] = useState(() =>
    resolveInitialProfileKeys(report, initialProfileKeys),
  );
  const [activeAnalysisIds, setActiveAnalysisIds] = useState<string[]>([]);
  const [clientAnalyzedByGame, setClientAnalyzedByGame] = useState<
    Record<string, ClientAnalyzedGame>
  >({});
  const [processingStatus, setProcessingStatus] = useState<ClientProcessingStatus>(
    createIdleClientProcessingStatus(),
  );
  const workerRef = useRef<Worker | null>(null);
  const activeAnalysisContextRef = useRef<string | null>(null);
  const lastAnalysisContextKeyRef = useRef<string | null>(null);
  const completedAnalysisContextRef = useRef<string | null>(null);
  const allProfileKeys = useMemo(
    () => report.profiles.map((profile) => profile.key),
    [report.profiles],
  );
  const selectedProfileKeySet = useMemo(
    () => new Set(selectedProfileKeys),
    [selectedProfileKeys],
  );
  const activeAnalysisIdSet = useMemo(
    () => new Set(activeAnalysisIds),
    [activeAnalysisIds],
  );

  const snapshot = buildPerformanceSnapshot(report, {
    rangeDays,
    gameType,
    profileKeys: selectedProfileKeys,
  });
  const analysisCacheKey = useMemo(
    () => buildAnalysisCacheKey(report.profiles.map((profile) => profile.key)),
    [report.profiles],
  );
  const filteredGames = useMemo(
    () =>
      report.games
        .filter((game) => selectedProfileKeySet.has(game.profileKey))
        .filter((game) => game.endTimeMs >= Date.now() - rangeDays * 24 * 60 * 60 * 1000)
        .filter((game) => matchesDashboardGameType(game, gameType))
        .sort((left, right) => right.endTimeMs - left.endTimeMs),
    [gameType, rangeDays, report.games, selectedProfileKeySet],
  );
  const totalLinkedProfiles = report.profiles.length;
  const performanceTitle = buildPerformanceTitle(
    snapshot.selectedProfiles,
    totalLinkedProfiles,
  );
  const performanceSubtitle = buildPerformanceSubtitle(
    snapshot.selectedProfiles,
    totalLinkedProfiles,
    rangeDays,
    gameType,
  );
  const analysisContextKey = useMemo(
    () => `${analysisCacheKey}:${rangeDays}:${gameType}:${selectedProfileKeys.join(",")}`,
    [analysisCacheKey, gameType, rangeDays, selectedProfileKeys],
  );

  const pendingClientAnalysisGames = useMemo(() => {
    return selectPendingClientAnalysisGames(filteredGames, clientAnalyzedByGame).filter(
      (game) => !activeAnalysisIdSet.has(game.id),
    );
  }, [activeAnalysisIdSet, clientAnalyzedByGame, filteredGames]);

  const mostBlunderedPiecesSummary = useMemo(
    () => summarizeMostBlunderedPiecesFromGames(filteredGames, clientAnalyzedByGame),
    [clientAnalyzedByGame, filteredGames],
  );

  useEffect(() => {
    const parsedEntries = parseClientAnalysisCache(localStorage.getItem(analysisCacheKey));
    setClientAnalyzedByGame(parsedEntries);
  }, [analysisCacheKey]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (lastAnalysisContextKeyRef.current === analysisContextKey) {
      return;
    }

    lastAnalysisContextKeyRef.current = analysisContextKey;
    completedAnalysisContextRef.current = null;

    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    if (
      activeAnalysisContextRef.current &&
      activeAnalysisContextRef.current !== analysisContextKey
    ) {
      activeAnalysisContextRef.current = null;
    }

    if (activeAnalysisIds.length > 0 || processingStatus.phase !== "idle") {
      setActiveAnalysisIds([]);
      setProcessingStatus(createIdleClientProcessingStatus());
    }
  }, [activeAnalysisIds.length, analysisContextKey, processingStatus.phase]);

  useEffect(() => {
    if (workerRef.current) return;
    if (completedAnalysisContextRef.current === analysisContextKey) return;

    if (pendingClientAnalysisGames.length === 0) {
      return;
    }

    const worker = new Worker(
      new URL("./workers/performance-analysis.worker.ts", import.meta.url),
    );
    workerRef.current = worker;
    activeAnalysisContextRef.current = analysisContextKey;
    setActiveAnalysisIds(pendingClientAnalysisGames.map((game) => game.id));

    setProcessingStatus(
      createStartingClientProcessingStatus(pendingClientAnalysisGames.length),
    );

    worker.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data as ClientAnalysisWorkerMessage;

      if (data.type === "progress") {
        setProcessingStatus((current) => applyClientAnalysisProgress(current, data));

        if (data.chunk.length > 0) {
          setClientAnalyzedByGame((current) => {
            const next = mergeClientAnalysisEntries(current, data.chunk, Date.now());

            try {
              localStorage.setItem(analysisCacheKey, serializeClientAnalysisCache(next));
            } catch {
              // Best-effort cache only.
            }

            return next;
          });
        }

        return;
      }

      if (data.type === "done") {
        setProcessingStatus((current) => applyClientAnalysisDone(current, data));
        worker.terminate();
        workerRef.current = null;
        activeAnalysisContextRef.current = null;
        completedAnalysisContextRef.current = analysisContextKey;
        setActiveAnalysisIds([]);
        return;
      }

      if (data.type === "error") {
        setProcessingStatus((current) =>
          applyClientAnalysisError(
            current,
            data,
            current.processedGames > 0 || mostBlunderedPiecesSummary.supported,
          ),
        );
        worker.terminate();
        workerRef.current = null;
        activeAnalysisContextRef.current = null;
        completedAnalysisContextRef.current = analysisContextKey;
        setActiveAnalysisIds([]);
      }
    };

    worker.onerror = () => {
      setProcessingStatus((current) =>
        applyClientAnalysisError(
          current,
          {
            type: "error",
            message: "Move-by-move piece error analysis is unavailable right now.",
            processedGames: current.processedGames,
            totalGames: current.totalGames,
            failedGames: current.failedGames,
          },
          current.processedGames > 0 || mostBlunderedPiecesSummary.supported,
        ),
      );
      worker.terminate();
      workerRef.current = null;
      activeAnalysisContextRef.current = null;
      completedAnalysisContextRef.current = analysisContextKey;
      setActiveAnalysisIds([]);
    };

    worker.onmessageerror = () => {
      setProcessingStatus((current) =>
        applyClientAnalysisError(
          current,
          {
            type: "error",
            message: "The analysis worker sent an unreadable message.",
            processedGames: current.processedGames,
            totalGames: current.totalGames,
            failedGames: current.failedGames,
          },
          current.processedGames > 0 || mostBlunderedPiecesSummary.supported,
        ),
      );
      worker.terminate();
      workerRef.current = null;
      activeAnalysisContextRef.current = null;
      completedAnalysisContextRef.current = analysisContextKey;
      setActiveAnalysisIds([]);
    };

    worker.postMessage({
      type: "start",
      games: pendingClientAnalysisGames,
      movetimeMs: CLIENT_ANALYSIS_MOVETIME_MS,
      idleBetweenMovesMs: CLIENT_ANALYSIS_IDLE_BETWEEN_MOVES_MS,
      idleBetweenGamesMs: CLIENT_ANALYSIS_IDLE_BETWEEN_GAMES_MS,
      engineInitTimeoutMs: CLIENT_ANALYSIS_ENGINE_INIT_TIMEOUT_MS,
      evaluationTimeoutMs: CLIENT_ANALYSIS_EVALUATION_TIMEOUT_MS,
    });
  }, [
    activeAnalysisIds.length,
    analysisCacheKey,
    analysisContextKey,
    mostBlunderedPiecesSummary.supported,
    pendingClientAnalysisGames,
  ]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("range", String(rangeDays));
    params.set("type", gameType);
    if (selectedProfileKeys.length > 0 && selectedProfileKeys.length < allProfileKeys.length) {
      params.set("profiles", selectedProfileKeys.join(","));
    } else {
      params.delete("profiles");
    }
    const nextUrl = `/performance?${params.toString()}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [allProfileKeys.length, gameType, rangeDays, selectedProfileKeys]);

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
              Performance
            </p>
            <h1 className="mt-3 text-3xl font-bold uppercase tracking-[0.16em] text-white">
              {performanceTitle}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--app-muted)]">
              {performanceSubtitle}
            </p>
          </div>

          <div className="app-brutal-inset grid gap-3 p-5 text-sm text-[var(--app-muted)]">
            <p>
              Selected accounts:{" "}
              <span className="font-bold text-white">{snapshot.selectedProfiles.length}</span>
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
                {snapshot.totalGameCount ?? "Unknown"}
              </span>
            </p>
            <div className="grid gap-2 pt-1">
              {snapshot.selectedProfiles.map((profile) => (
                <a
                  key={profile.key}
                  href={profile.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-accent)] transition hover:text-white"
                >
                  {profile.providerLabel} - {profile.username}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-5">
          {report.profiles.length > 1 ? (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--app-muted)]">
                    Linked Accounts
                  </p>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--app-muted)]">
                    Select one or more linked profiles to focus the stats on a single
                    account or mix them together.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {report.profiles.map((profile) => {
                  const isActive = selectedProfileKeySet.has(profile.key);

                  return (
                    <button
                      key={profile.key}
                      type="button"
                      onClick={() =>
                        setSelectedProfileKeys((current) =>
                          toggleProfileSelection(current, profile.key, allProfileKeys),
                        )
                      }
                      className={`${filterButtonClass(isActive)} h-auto justify-start px-3 py-3`}
                      aria-pressed={isActive}
                    >
                      <span className="flex flex-col items-start text-left leading-tight">
                        <span className="text-sm font-bold normal-case tracking-normal">
                          {profile.username}
                        </span>
                        <span className="mt-1 text-[10px] font-bold normal-case tracking-[0.18em] opacity-80">
                          {profile.providerLabel}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

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
            Performance by Think Time
          </h2>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--app-muted)]">
            See which think-time buckets produce better moves, more rushed errors, or wasted long thinks.
          </p>
        </div>
        {snapshot.timeManagement.supported ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {renderTimeManagementColumn("You", snapshot.timeManagement.user)}
            {renderTimeManagementColumn("Opponent", snapshot.timeManagement.opponent)}
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

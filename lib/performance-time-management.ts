const MAX_CP_LOSS_PER_MOVE = 600;
export const INACCURACY_CP_THRESHOLD = 50;
export const MISTAKE_CP_THRESHOLD = 100;
export const BLUNDER_CP_THRESHOLD = 300;

export type ThinkTimeBucketKey = "under5" | "5to15" | "15to30" | "30plus";
export type TimeManagementSide = "user" | "opponent";
export type TimeManagementQualitySignal = "accuracy" | "avgCpl" | "none";
export type PlayerColor = "white" | "black";

export interface ThinkTimeBucketDefinition {
  key: ThinkTimeBucketKey;
  label: string;
  minSeconds: number;
  maxSeconds: number | null;
}

export interface TimeManagementSourceGame {
  totalPlies: number;
  userColor: PlayerColor;
  userMoveDurations: number[];
  opponentMoveDurations: number[];
  userMoveCpLosses: Array<number | null>;
  opponentMoveCpLosses: Array<number | null>;
}

export interface TimeManagementMoveSample {
  bucketKey: ThinkTimeBucketKey;
  durationSeconds: number;
  cpLoss: number | null;
  accuracyPct: number | null;
}

export interface ThinkTimeBucketSummary {
  key: ThinkTimeBucketKey;
  label: string;
  moveCount: number;
  moveSharePct: number;
  qualityMoveCount: number;
  accuracyPct: number | null;
  blunderRatePct: number | null;
  mistakeRatePct: number | null;
  avgCpl: number | null;
  mistakes: number;
  blunders: number;
}

export interface TimeManagementSideSummary {
  supported: boolean;
  sampleSize: number;
  totalMoves: number;
  excludedMoveCount: number;
  qualitySampleSize: number;
  qualitySignal: TimeManagementQualitySignal;
  bestThinkZone: ThinkTimeBucketSummary | null;
  bestThinkZoneSignal: TimeManagementQualitySignal;
  rushErrorRatePct: number | null;
  overthinkRatePct: number | null;
  longThinkPayoffPct: number | null;
  buckets: ThinkTimeBucketSummary[];
}

export interface TimeManagementOverview {
  supported: boolean;
  user: TimeManagementSideSummary;
  opponent: TimeManagementSideSummary;
}

export const THINK_TIME_BUCKETS: readonly ThinkTimeBucketDefinition[] = [
  { key: "under5", label: "0-5s", minSeconds: 0, maxSeconds: 5 },
  { key: "5to15", label: "5-15s", minSeconds: 5, maxSeconds: 15 },
  { key: "15to30", label: "15-30s", minSeconds: 15, maxSeconds: 30 },
  { key: "30plus", label: "30s+", minSeconds: 30, maxSeconds: null },
] as const;

export function getThinkTimeBucketKey(
  durationSeconds: number,
): ThinkTimeBucketKey | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) return null;
  if (durationSeconds < 5) return "under5";
  if (durationSeconds < 15) return "5to15";
  if (durationSeconds < 30) return "15to30";
  return "30plus";
}

export function summarizeTimeManagementOverview(
  games: TimeManagementSourceGame[],
): TimeManagementOverview {
  const user = summarizeTimeManagementSide(games, "user");
  const opponent = summarizeTimeManagementSide(games, "opponent");

  return {
    supported: user.supported || opponent.supported,
    user,
    opponent,
  };
}

export function summarizeTimeManagementSide(
  games: TimeManagementSourceGame[],
  side: TimeManagementSide,
): TimeManagementSideSummary {
  const collected = collectTimeManagementMoveSamples(games, side);
  const buckets = buildTimeBucketSummaries(collected.samples);
  const bestThinkZone = deriveBestThinkZone(buckets);
  const rushErrorRatePct = deriveRushErrorRatePct(buckets);
  const overthink = deriveOverthinkMetrics(collected.samples);

  return {
    supported: collected.samples.length > 0,
    sampleSize: collected.sampleSize,
    totalMoves: collected.samples.length,
    excludedMoveCount: collected.excludedMoveCount,
    qualitySampleSize: collected.qualitySampleSize,
    qualitySignal: collected.qualitySampleSize > 0 ? "accuracy" : "none",
    bestThinkZone: bestThinkZone.bucket,
    bestThinkZoneSignal: bestThinkZone.signal,
    rushErrorRatePct,
    overthinkRatePct: overthink.overthinkRatePct,
    longThinkPayoffPct: overthink.longThinkPayoffPct,
    buckets,
  };
}

export function buildTimeBucketSummaries(
  samples: TimeManagementMoveSample[],
): ThinkTimeBucketSummary[] {
  const accumulators = new Map(
    THINK_TIME_BUCKETS.map((bucket) => [
      bucket.key,
      {
        moveCount: 0,
        qualityMoveCount: 0,
        accuracyTotal: 0,
        cpLossTotal: 0,
        mistakes: 0,
        blunders: 0,
      },
    ]),
  );

  for (const sample of samples) {
    const accumulator = accumulators.get(sample.bucketKey);
    if (!accumulator) continue;

    accumulator.moveCount += 1;

    if (sample.cpLoss === null) continue;

    accumulator.qualityMoveCount += 1;
    accumulator.accuracyTotal += sample.accuracyPct ?? 0;
    accumulator.cpLossTotal += sample.cpLoss;

    if (sample.cpLoss >= BLUNDER_CP_THRESHOLD) {
      accumulator.blunders += 1;
    } else if (sample.cpLoss >= MISTAKE_CP_THRESHOLD) {
      accumulator.mistakes += 1;
    }
  }

  return THINK_TIME_BUCKETS.map((bucket) => {
    const accumulator = accumulators.get(bucket.key)!;

    return {
      key: bucket.key,
      label: bucket.label,
      moveCount: accumulator.moveCount,
      moveSharePct:
        samples.length > 0 ? toPercent((accumulator.moveCount / samples.length) * 100) : 0,
      qualityMoveCount: accumulator.qualityMoveCount,
      accuracyPct:
        accumulator.qualityMoveCount > 0
          ? toPercent(accumulator.accuracyTotal / accumulator.qualityMoveCount)
          : null,
      blunderRatePct:
        accumulator.qualityMoveCount > 0
          ? toPercent((accumulator.blunders / accumulator.qualityMoveCount) * 100)
          : null,
      mistakeRatePct:
        accumulator.qualityMoveCount > 0
          ? toPercent((accumulator.mistakes / accumulator.qualityMoveCount) * 100)
          : null,
      avgCpl:
        accumulator.qualityMoveCount > 0
          ? roundToTenths(accumulator.cpLossTotal / accumulator.qualityMoveCount)
          : null,
      mistakes: accumulator.mistakes,
      blunders: accumulator.blunders,
    };
  });
}

export function deriveBestThinkZone(buckets: ThinkTimeBucketSummary[]): {
  bucket: ThinkTimeBucketSummary | null;
  signal: TimeManagementQualitySignal;
} {
  const bucketsWithMoves = buckets.filter((bucket) => bucket.moveCount > 0);
  const withAccuracy = bucketsWithMoves.filter((bucket) => bucket.accuracyPct !== null);

  if (withAccuracy.length > 0) {
    return {
      bucket: withAccuracy.reduce((best, bucket) => {
        if (!best) return bucket;
        if ((bucket.accuracyPct ?? 0) > (best.accuracyPct ?? 0)) return bucket;
        if ((bucket.accuracyPct ?? 0) < (best.accuracyPct ?? 0)) return best;
        return bucket.moveCount > best.moveCount ? bucket : best;
      }, null as ThinkTimeBucketSummary | null),
      signal: "accuracy",
    };
  }

  const withCpl = bucketsWithMoves.filter((bucket) => bucket.avgCpl !== null);
  if (withCpl.length > 0) {
    return {
      bucket: withCpl.reduce((best, bucket) => {
        if (!best) return bucket;
        if ((bucket.avgCpl ?? Number.POSITIVE_INFINITY) < (best.avgCpl ?? Number.POSITIVE_INFINITY)) {
          return bucket;
        }
        if ((bucket.avgCpl ?? Number.POSITIVE_INFINITY) > (best.avgCpl ?? Number.POSITIVE_INFINITY)) {
          return best;
        }
        return bucket.moveCount > best.moveCount ? bucket : best;
      }, null as ThinkTimeBucketSummary | null),
      signal: "avgCpl",
    };
  }

  return {
    bucket: null,
    signal: "none",
  };
}

export function deriveRushErrorRatePct(
  buckets: ThinkTimeBucketSummary[],
): number | null {
  const totalErrors = buckets.reduce(
    (sum, bucket) => sum + bucket.mistakes + bucket.blunders,
    0,
  );
  if (totalErrors === 0) return null;

  const rushedBucket = buckets.find((bucket) => bucket.key === "under5");
  const rushedErrors = (rushedBucket?.mistakes ?? 0) + (rushedBucket?.blunders ?? 0);

  return toPercent((rushedErrors / totalErrors) * 100);
}

export function deriveOverthinkMetrics(samples: TimeManagementMoveSample[]): {
  overthinkRatePct: number | null;
  longThinkPayoffPct: number | null;
  signal: TimeManagementQualitySignal;
} {
  const evaluableSamples = samples.filter(
    (sample) => sample.accuracyPct !== null && sample.cpLoss !== null,
  );

  if (evaluableSamples.length === 0) {
    return {
      overthinkRatePct: null,
      longThinkPayoffPct: null,
      signal: "none",
    };
  }

  const longThinkSamples = evaluableSamples.filter(
    (sample) => sample.bucketKey === "30plus",
  );
  if (longThinkSamples.length === 0) {
    return {
      overthinkRatePct: null,
      longThinkPayoffPct: null,
      signal: "accuracy",
    };
  }

  // Reuses the repo's existing CPL -> accuracy transform and compares each 30s+
  // move against the side's own overall baseline. Long-think moves that do not
  // beat that baseline count as non-payoff.
  const accuracyBaseline =
    evaluableSamples.reduce((sum, sample) => sum + (sample.accuracyPct ?? 0), 0) /
    evaluableSamples.length;
  const nonPayoffMoves = longThinkSamples.filter(
    (sample) => (sample.accuracyPct ?? 0) <= accuracyBaseline,
  ).length;
  const overthinkRatePct = toPercent((nonPayoffMoves / longThinkSamples.length) * 100);

  return {
    overthinkRatePct,
    longThinkPayoffPct: toPercent(100 - overthinkRatePct),
    signal: "accuracy",
  };
}

export function normalizeCpLoss(cpLoss: number) {
  return Math.min(Math.max(cpLoss, 0), MAX_CP_LOSS_PER_MOVE);
}

export function cpLossToAccuracy(cpLoss: number) {
  return toPercent(Math.max(0, 100 * Math.exp(-cpLoss / 140)));
}

function collectTimeManagementMoveSamples(
  games: TimeManagementSourceGame[],
  side: TimeManagementSide,
) {
  const samples: TimeManagementMoveSample[] = [];
  let sampleSize = 0;
  let excludedMoveCount = 0;

  for (const game of games) {
    const durations =
      side === "user" ? game.userMoveDurations : game.opponentMoveDurations;
    const cpLosses =
      side === "user" ? game.userMoveCpLosses : game.opponentMoveCpLosses;
    let usableMovesInGame = 0;

    for (let moveIndex = 0; moveIndex < durations.length; moveIndex += 1) {
      const durationSeconds = durations[moveIndex];
      const bucketKey = getThinkTimeBucketKey(durationSeconds);
      if (!bucketKey) continue;

      usableMovesInGame += 1;
      const cpLoss = cpLosses[moveIndex];
      const normalizedCpLoss =
        typeof cpLoss === "number" && Number.isFinite(cpLoss)
          ? normalizeCpLoss(cpLoss)
          : null;

      samples.push({
        bucketKey,
        durationSeconds,
        cpLoss: normalizedCpLoss,
        accuracyPct:
          normalizedCpLoss !== null ? cpLossToAccuracy(normalizedCpLoss) : null,
      });
    }

    if (usableMovesInGame > 0) {
      sampleSize += 1;
    }

    excludedMoveCount += Math.max(
      0,
      getExpectedMoveCountForSide(game, side) - usableMovesInGame,
    );
  }

  return {
    samples,
    sampleSize,
    excludedMoveCount,
    qualitySampleSize: samples.filter((sample) => sample.cpLoss !== null).length,
  };
}

function getExpectedMoveCountForSide(
  game: TimeManagementSourceGame,
  side: TimeManagementSide,
) {
  const whiteMoves = Math.ceil(game.totalPlies / 2);
  const blackMoves = Math.floor(game.totalPlies / 2);
  const userMoves = game.userColor === "white" ? whiteMoves : blackMoves;
  const opponentMoves = game.userColor === "white" ? blackMoves : whiteMoves;

  return side === "user" ? userMoves : opponentMoves;
}

function toPercent(value: number) {
  return Math.round(value * 10) / 10;
}

function roundToTenths(value: number) {
  return Math.round(value * 10) / 10;
}

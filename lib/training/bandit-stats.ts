/**
 * Bayesian Bandit statistics for training bucket performance tracking.
 *
 * Each bucket stores alpha (wins) and beta (losses) parameters for a Beta prior.
 * Attempts counter tracks total serves for reporting.
 */

import type { TrainingBucket } from "./queue-core";

export type BucketStatEntry = {
  alpha: number;
  beta: number;
  attempts: number;
};

export type BucketStats = Record<string, BucketStatEntry>;

export const DEFAULT_BUCKET_STATS: BucketStats = {
  opening: { alpha: 1, beta: 1, attempts: 0 },
  middlegame: { alpha: 1, beta: 1, attempts: 0 },
  endgame: { alpha: 1, beta: 1, attempts: 0 },
  tactic: { alpha: 1, beta: 1, attempts: 0 },
  opening_gambit: { alpha: 1, beta: 1, attempts: 0 },
  opening_development: { alpha: 1, beta: 1, attempts: 0 },
  middlegame_attack: { alpha: 1, beta: 1, attempts: 0 },
  middlegame_positional: { alpha: 1, beta: 1, attempts: 0 },
  endgame_rook: { alpha: 1, beta: 1, attempts: 0 },
  endgame_pawn: { alpha: 1, beta: 1, attempts: 0 },
  wildcard: { alpha: 1, beta: 1, attempts: 0 },
};

export function normalizeBucketStats(value: unknown): BucketStats {
  if (!value || typeof value !== "object") return { ...DEFAULT_BUCKET_STATS };
  const candidate = value as Record<string, unknown>;
  const result: BucketStats = { ...DEFAULT_BUCKET_STATS };
  for (const key of Object.keys(result)) {
    const entry = candidate[key];
    if (!entry || typeof entry !== "object") {
      delete result[key];
      continue;
    }
    const e = entry as Record<string, unknown>;
    const alpha = typeof e.alpha === "number" && e.alpha > 0 ? e.alpha : 1;
    const beta = typeof e.beta === "number" && e.beta > 0 ? e.beta : 1;
    const attempts = typeof e.attempts === "number" && e.attempts >= 0 ? e.attempts : 0;
    result[key] = { alpha, beta, attempts };
  }
  return result;
}

/**
 * Draw a sample from the Beta distribution for each bucket using the given RNG.
 * Uses Marsaglia and Tsang's method for Beta sampling.
 */
export function sampleBeta(alpha: number, beta: number, rng: () => number): number {
  if (alpha <= 0 || beta <= 0) return 0.5;
  if (alpha < 1 && beta < 1) {
    let a: number, b: number;
    while (true) {
      a = rng();
      b = rng();
      const u = a ** (1 / alpha);
      const v = b ** (1 / beta);
      if (u + v <= 1) return u / (u + v);
    }
  }
  // Use gamma approximation for alpha >= 1 || beta >= 1
  const gammaA = sampleGamma(alpha, rng);
  const gammaB = sampleGamma(beta, rng);
  return gammaA / (gammaA + gammaB);
}

function sampleGamma(shape: number, rng: () => number): number {
  if (shape < 1) {
    return sampleGamma(shape + 1, rng) * rng() ** (1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number, v: number;
    do {
      x = normalSample(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * (d * d) * (d * d) * (u * u)) return d * v;
    if (Math.log(u) < 0.5 * d * (d * (1 - v + Math.log(v)))) return d * v;
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function normalSample(rng: () => number): number {
  let u: number, v: number;
  do {
    u = rng();
    v = rng();
  } while (u === 0);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Thompson sample each bucket and return the bucket with the highest sample.
 */
export function thompsonSample(bucketStats: BucketStats, rng: () => number): TrainingBucket | null {
  const keys = Object.keys(bucketStats);
  if (keys.length === 0) return null;
  let bestKey: string | null = null;
  let bestSample = -1;
  for (const key of keys) {
    const { alpha, beta } = bucketStats[key]!;
    const sample = sampleBeta(alpha, beta, rng);
    if (sample > bestSample) {
      bestSample = sample;
      bestKey = key;
    }
  }
  return bestKey as TrainingBucket | null;
}

/**
 * Record a result for a bucket: increment attempts and update alpha/beta.
 * @param bucketStats Current bucket stats
 * @param bucket The bucket that was served
 * @param success Whether the user performed well (eval preservation >= 0.6)
 */
export function recordBucketResult(
  bucketStats: BucketStats,
  bucket: string,
  success: boolean,
): BucketStats {
  const updated = { ...bucketStats };
  const existing = updated[bucket];
  if (!existing) {
    updated[bucket] = { alpha: success ? 2 : 1, beta: success ? 1 : 2, attempts: 1 };
    return updated;
  }
  updated[bucket] = {
    alpha: existing.alpha + (success ? 1 : 0),
    beta: existing.beta + (success ? 0 : 1),
    attempts: existing.attempts + 1,
  };
  return updated;
}

/**
 * Merge incoming stats with existing, accumulating alpha/beta/attempts.
 */
export function mergeBucketStats(existing: BucketStats, incoming: BucketStats): BucketStats {
  const result: BucketStats = { ...existing };
  for (const [key, entry] of Object.entries(incoming)) {
    if (!result[key]) {
      result[key] = { ...entry };
    } else {
      result[key] = {
        alpha: result[key]!.alpha + entry.alpha,
        beta: result[key]!.beta + entry.beta,
        attempts: result[key]!.attempts + entry.attempts,
      };
    }
  }
  return result;
}

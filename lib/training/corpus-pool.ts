/**
 * Corpus Hot Pool Loader — Stage 2 scaffolding.
 *
 * Lazily loads the hot pool JSONL and cluster summary from disk on first access.
 * All functions are no-ops when the corpus recommender is not enabled.
 *
 * Does NOT implement Thompson sampling or position selection — that logic lives
 * in the serving layer and will use the raw data here.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { CORPUS_CONFIG } from "./corpus-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HotPoolRow = {
  fen: string;
  normalizedFen: string;
  clusterId: string;
  source: string;
  phase: string;
  sideToMove: string;
  materialFamily: string;
  evalBand: string;
  isPuzzle: boolean;
  evalCp: number;
  mate: number | null;
  bestMove: string | null;
  legalMoveCount: number;
  distanceToCentroid: number;
  features: {
    materialBalanceCpApprox: number;
    legalMoveCount: number;
    evalCpClipped: number;
    mateSignedClipped: number;
  };
};

export type ClusterSummary = {
  clusterId: string;
  inputSize: number;
  outputSize: number;
  phase: string;
  sideToMove: string;
  materialFamily: string;
  evalBand: string;
  source: string;
  isPuzzle: boolean;
  avgDistanceToCentroid: number;
  avgEvalCp: number;
  representativeFens: string[];
};

export type HotPoolSummary = {
  generatedAt: string;
  input: string;
  totalInputRows: number;
  totalOutputRows: number;
  totalClustersInput: number;
  totalClustersOutput: number;
  skippedInvalidFen: number;
  skippedTerminal: number;
  skippedDuplicateNormalizedFen: number;
  skippedSmallCluster: number;
  clusters: ClusterSummary[];
};

// ---------------------------------------------------------------------------
// Module-level caches (survive across calls within a server instance)
// ---------------------------------------------------------------------------

let _hotPool: HotPoolRow[] | null = null;
let _hotPoolLoadedAt: string | null = null;
let _clusterSummary: HotPoolSummary | null = null;
let _clusterSummaryLoadedAt: string | null = null;

// ---------------------------------------------------------------------------
// File reading helpers
// ---------------------------------------------------------------------------

function readJsonFile<T>(filePath: string): T {
  const resolved = resolve(process.cwd(), filePath);
  const content = readFileSync(resolved, "utf-8");
  return JSON.parse(content) as T;
}

function readJsonlFile<T>(filePath: string): T[] {
  const resolved = resolve(process.cwd(), filePath);
  const content = readFileSync(resolved, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim() !== "");
  return lines.map((line) => JSON.parse(line) as T);
}

// ---------------------------------------------------------------------------
// Hot pool access
// ---------------------------------------------------------------------------

/**
 * Lazily load the hot pool from disk (or return the cached instance).
 * Only loads when CORPUS_CONFIG.enabled is true.
 */
export function loadHotPool(): readonly HotPoolRow[] {
  if (!CORPUS_CONFIG.enabled) {
    return [];
  }
  if (_hotPool === null) {
    _hotPool = readJsonlFile<HotPoolRow>(CORPUS_CONFIG.hotPoolPath);
    _hotPoolLoadedAt = new Date().toISOString();
  }
  return _hotPool;
}

/**
 * Force a reload of the hot pool from disk, bypassing the cache.
 */
export function reloadHotPool(): readonly HotPoolRow[] {
  _hotPool = null;
  _hotPoolLoadedAt = null;
  return loadHotPool();
}

/**
 * Get the hot pool rows for a specific cluster.
 */
export function getHotPoolRowsForCluster(clusterId: string): readonly HotPoolRow[] {
  const pool = loadHotPool();
  return pool.filter((row) => row.clusterId === clusterId);
}

/**
 * Get the timestamp of the last hot pool load (ISO string), or null if not loaded.
 */
export function getHotPoolLoadedAt(): string | null {
  return _hotPoolLoadedAt;
}

// ---------------------------------------------------------------------------
// Cluster summary access
// ---------------------------------------------------------------------------

/**
 * Lazily load the cluster summary from disk (or return the cached instance).
 * Only loads when CORPUS_CONFIG.enabled is true.
 */
export function loadClusterSummary(): HotPoolSummary | null {
  if (!CORPUS_CONFIG.enabled) {
    return null;
  }
  if (_clusterSummary === null) {
    _clusterSummary = readJsonFile<HotPoolSummary>(CORPUS_CONFIG.summaryPath);
    _clusterSummaryLoadedAt = new Date().toISOString();
  }
  return _clusterSummary;
}

/**
 * Force a reload of the cluster summary from disk, bypassing the cache.
 */
export function reloadClusterSummary(): HotPoolSummary | null {
  _clusterSummary = null;
  _clusterSummaryLoadedAt = null;
  return loadClusterSummary();
}

/**
 * Get the timestamp of the last summary load (ISO string), or null if not loaded.
 */
export function getClusterSummaryLoadedAt(): string | null {
  return _clusterSummaryLoadedAt;
}

// ---------------------------------------------------------------------------
// Cluster metadata helpers
// ---------------------------------------------------------------------------

/**
 * Get all eligible cluster IDs (outputSize >= minSize).
 */
export function getEligibleClusterIds(minSize = 3): readonly string[] {
  const summary = loadClusterSummary();
  if (!summary) return [];
  return summary.clusters
    .filter((c) => c.outputSize >= minSize)
    .map((c) => c.clusterId);
}

/**
 * Get the cluster metadata for a specific clusterId.
 */
export function getClusterMeta(clusterId: string): ClusterSummary | null {
  const summary = loadClusterSummary();
  if (!summary) return null;
  return summary.clusters.find((c) => c.clusterId === clusterId) ?? null;
}

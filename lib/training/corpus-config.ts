/**
 * Corpus Recommender Configuration — Stage 2 scaffolding.
 *
 * All values are disabled-by-default. Setting ENABLE_CORPUS_RECOMMENDER="true"
 * does not automatically route traffic — it only makes the hot pool available.
 * Actual traffic routing (fallback / explore % / A/B) is a separate decision
 * wired in the serving layer.
 *
 * @example Enable for local development:
 *   ENABLE_CORPUS_RECOMMENDER=true CORPUS_RECOMMENDER_TRAFFIC_PERCENT=0 npm run dev
 */

export const CORPUS_CONFIG = {
  /**
   * Master switch: enables hot pool loading and makes corpus selection available.
   * Does NOT automatically route any traffic — that is always explicit in the serving layer.
   */
  enabled: process.env.ENABLE_CORPUS_RECOMMENDER === "true",

  /**
   * Percentage of explore requests handled by the corpus path.
   * 0 = corpus disabled for serving; 5 = 5% of explore requests use corpus.
   * Only meaningful when `enabled` is true.
   */
  trafficPercent: parseInt(process.env.CORPUS_RECOMMENDER_TRAFFIC_PERCENT ?? "0", 10),

  /**
   * Path to the hot pool JSONL file, relative to the project root.
   * Served as a static file from public/corpus/.
   */
  hotPoolPath: process.env.CORPUS_HOT_POOL_PATH ?? "public/corpus/hot_pool_v0.jsonl",

  /**
   * Path to the cluster summary JSON, relative to the project root.
   */
  summaryPath: process.env.CORPUS_SUMMARY_PATH ?? "public/corpus/hot_pool_summary_v0.json",

  /**
   * When all queues (exploit/explore/revisit) are empty, use corpus as fallback.
   */
  fallbackEnabled: true,

  /**
   * Max distanceToCentroid for position selection within a cluster.
   */
  maxDistance: 10,

  /**
   * Min distanceToCentroid for position selection within a cluster.
   */
  minDistance: 0,
} as const;

export type CorpusConfig = typeof CORPUS_CONFIG;

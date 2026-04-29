-- Stage 1: Persist cluster_stats and recent_clusters for future corpus recommender.
-- These columns hold per-user per-cluster bandit telemetry (posterior alpha/beta)
-- and a recency list used to penalize recently-served clusters.
--
-- Shape of cluster_stats JSON:
-- {
--   "app:v0:middlegame:opening_gambit": {
--     "attempts": 5,
--     "successes": 1,
--     "failures": 4,
--     "neutralCount": 0,
--     "posteriorAlpha": 5,
--     "posteriorBeta": 2,
--     "lastServedAt": "2026-04-28T20:00:00Z"
--   }
-- }
--
-- Shape of recent_clusters JSON:
-- ["app:v0:middlegame:opening_gambit", "app:v0:opening:wildcard", ...]
-- Most-recent-first. Trimmed to last 20 entries in complete-sequence route.

ALTER TABLE public.user_blindspot_profile
  ADD COLUMN IF NOT EXISTS cluster_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS recent_clusters jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.user_blindspot_profile.cluster_stats IS
  'Per-user cluster telemetry for future corpus recommender. JSON object keyed by clusterId (app:v0:phase:bucket format). Tracks attempts, successes, failures, neutralCount, and Beta posterior parameters derived from position_evaluations written during complete-sequence.';
COMMENT ON COLUMN public.user_blindspot_profile.recent_clusters IS
  'Most recently served cluster IDs (app:v0:phase:bucket), newest first. Trimmed to last 20 entries. Used by the future corpus recommender to apply a recency penalty in Thompson cluster selection.';
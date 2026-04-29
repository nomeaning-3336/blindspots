-- Stage 1 Validation: cluster_stats / recent_clusters persistence
--
-- Run each block individually with:
--   npm run db:query -- "<paste query here>"
--
-- Replace YOUR_USER_ID with the user_id you want to validate.
-- All queries are read-only SELECTs only.

-- ============================================================================
-- QUERY 1: Verify clusterId in position_evaluations from most recent sessions
-- ============================================================================
SELECT
  ts.id,
  ts.completed_at,
  jsonb_array_length(ts.position_evaluations) AS eval_count,
  (ts.position_evaluations->0)->>'clusterId'  AS first_cluster_id,
  (ts.position_evaluations->0)->>'phase'       AS first_phase,
  (ts.position_evaluations->0)->>'bucket'      AS first_bucket,
  (ts.position_evaluations->0)->>'banditResult' AS first_result
FROM training_sessions ts
WHERE ts.user_id = 'YOUR_USER_ID'
  AND ts.completed_at IS NOT NULL
ORDER BY ts.completed_at DESC
LIMIT 5;

-- ============================================================================
-- QUERY 2: Check cluster_stats shape for a user
-- posteriorAlpha = failures + 1, posteriorBeta = successes + 1
-- posteriorAlpha + posteriorBeta = failures + successes + 2
-- neutralCount increases attempts but not alpha or beta
-- ============================================================================
WITH keys AS (
  SELECT
    user_id,
    jsonb_object_keys(cluster_stats) AS cluster_key,
    cluster_stats
  FROM user_blindspot_profile
  WHERE user_id = 'YOUR_USER_ID'
)
SELECT
  user_id,
  cluster_key,
  cluster_stats -> cluster_key AS sample_entry
FROM keys
LIMIT 20;

-- ============================================================================
-- QUERY 3: Check recent_clusters array
-- ============================================================================
SELECT
  user_id,
  jsonb_array_length(recent_clusters) AS recent_count,
  recent_clusters
FROM user_blindspot_profile
WHERE user_id = 'YOUR_USER_ID';

-- ============================================================================
-- QUERY 4: Full profile summary (user_blindspot_profile row)
-- ============================================================================
SELECT
  user_id,
  blindspots_elo,
  total_sequences,
  cluster_stats ? 'app:v0' AS has_cluster_stats,
  jsonb_object_keys(cluster_stats) AS cluster_keys,
  recent_clusters
FROM user_blindspot_profile
WHERE user_id = 'YOUR_USER_ID';

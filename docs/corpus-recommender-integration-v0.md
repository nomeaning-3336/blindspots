# Corpus Recommender Integration V0 — Design Doc

## 1. Current State

The offline corpus recommender prototype is complete:

```
ingest_lichess_eval.py        # stream .zst → normalized JSONL
extract_position_features.py  # 42-dim feature vectors
cluster_positions_v0.py        # hard partitions + MiniBatchKMeans
inspect_clusters_v0.py         # cluster quality inspection
export_hot_pool_v0.py          # compact app-ready candidate pool
get_position_v0.py            # single position selector
select_cluster_v0.py          # Thompson cluster selection
demo_recommender_v0.py         # end-to-end demo
```

Artifacts exist locally:

```
cache/corpus/lichess_eval_sample.jsonl        # 100k normalized rows
cache/corpus/lichess_eval_features.jsonl       # with 42-dim vectors
cache/corpus/lichess_eval_clusters.jsonl       # with cluster IDs
cache/corpus/cluster_summary_v0.json            # per-cluster stats
cache/corpus/hot_pool_v0.jsonl                  # 50k compact candidates
cache/corpus/hot_pool_summary_v0.json           # export summary
```

The pipeline currently has **no user signal**. Cluster selection uses flat Beta(1,1) priors — essentially random from the pool's perspective. The live `/train` recommender (Thompson-over-bucket-stats) is the production system and works correctly.

---

## 2. Why Not Wire Into `/train` Immediately

**Without `user_cluster_stats`, cluster selection is random-prior Thompson sampling.** The corpus recommender would pick clusters with no user history to condition on, making it a statistically complex random position dispenser. This is strictly worse than the current bucket-based recommender which at least has bandit feedback from real sessions.

Additional reasons to wait:

- **Cluster quality unproven at scale.** The 100k-row sample passes inspection, but the 70 partitions with 120 clusters may have systematic biases (opening-heavy, mate-dominated, evalCp-skewed). Larger samples needed before trusting serving traffic.
- **Mate/eval filtering needs QA.** `evalCpClipped` is clipped at ±2000, but the eval band thresholds (`worse < -300`, `better > 300`) are somewhat arbitrary. The "mate" band may be over-represented.
- **Hot pool source bias.** All positions come from Lichess eval DB — a specific Elo range and player pool. Not representative of all training needs.
- **Production system should not be swapped abruptly.** The live recommender has proven bandit feedback. A parallel evaluation path (not replacement) is the safe approach.

---

## 3. Required App-Side State

Before the corpus recommender can make informed cluster selections, it needs real user signal. The minimum required state:

### Option A: JSONB column (simpler, faster to implement)

```sql
ALTER TABLE user_blindspot_profile
  ADD COLUMN IF NOT EXISTS cluster_stats jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Shape per cluster:
```json
{
  "app:v0:middlegame:opening_gambit": {
    "attempts": 5,
    "successes": 1,
    "failures": 4,
    "neutralCount": 0,
    "posteriorAlpha": 5,
    "posteriorBeta": 2,
    "lastServedAt": "2026-04-28T20:00:00Z"
  }
}
```

> **Note:** Stage 1 uses coarse `app:v0:{phase}:{bucket}` cluster IDs (derived from the existing `phase` and `bucket` of each position) rather than the fine-grained corpus pipeline IDs. This keeps the app decoupled from the corpus clustering details and allows the corpus pipeline to evolve independently. The corpus pipeline will eventually map its own fine-grained IDs back to these coarse IDs for serving.

**Advantage:** Single column, small migration, easy to update in `complete-sequence` route.

**Disadvantage:** No per-cluster indexes, hard to query "which clusters has this user never tried?", but not needed for V0.

### Option B: Separate table (correct normalization)

```sql
CREATE TABLE user_cluster_stats (
  user_id          TEXT NOT NULL REFERENCES user_blindspot_profile(user_id),
  cluster_id       TEXT NOT NULL,
  attempts         INT NOT NULL DEFAULT 0,
  successes        INT NOT NULL DEFAULT 0,
  failures         INT NOT NULL DEFAULT 0,
  posterior_alpha   REAL NOT NULL DEFAULT 1.0,
  posterior_beta    REAL NOT NULL DEFAULT 1.0,
  last_served_at   TIMESTAMPTZ,
  PRIMARY KEY (user_id, cluster_id)
);
```

**Advantage:** Proper relational model, can query unvisited clusters.

**Disadvantage:** Requires migration, more complex update logic in the hot path.

### Recommendation

**Use Option A (JSONB) for V0.** The JSONB shape matches the existing `bucket_stats` pattern already in `user_blindspot_profile`. Keep it simple. Migration to a proper table is a later optimization.

---

### Additional required state

**Recent served clusters** (to apply the -0.20 penalty):

```sql
ALTER TABLE user_blindspot_profile
  ADD COLUMN IF NOT EXISTS recent_clusters jsonb NOT NULL DEFAULT '[]'::jsonb;
```

Store as array of clusterId strings, most-recent-first. Trim to last 20 entries in `complete-sequence` route.

---

### Mapping existing `position_evaluations` to `clusterId`

The `position_evaluations` column in `training_sessions` already captures per-move data: `decisionFen`, `cpLoss`, `classification`, `banditResult`, `bucket`. To derive cluster IDs from these:

1. When `complete-sequence` runs, also compute `clusterId` for each position by:
   - Re-running `classifyTrainingPhase` + `classifyTrainingBucket` + `classifyEvalBand` on `decisionFen`
   - Matching against the 6 hard partition keys
2. Write clusterId into `position_evaluations` at session write time (add `clusterId` field to each position entry)
3. After session completes, update `cluster_stats` JSONB for each unique clusterId touched in the session

This means **no hot pool lookup is needed at serve time** — the cluster assignment happens offline during session write, using the same classification logic used to build the hot pool originally.

---

## 4. Cluster ID Assignment for App Positions

Two options:

**Option A (recommended for V0): Hot-pool-only cluster IDs**

- Only positions that come from `hot_pool_v0.jsonl` have a `clusterId`
- User-game-derived positions use existing bucket stats only
- Corpus recommender can only serve positions it has pre-assigned cluster IDs for
- Safest: no feature extraction needed in app, no nearest-cluster logic
- Limitation: most training sessions will still use bucket-based serving

**Option B: Feature-based cluster assignment**

- For any `decisionFen`, compute V0 features server-side and find nearest cluster
- Requires: feature extraction logic in app/server, hot pool loaded in memory
- More powerful: every position gets a cluster ID
- Complexity: significant — requires embedding lookup, distance computation, periodic hot pool reload

### Recommendation

**Option A for now.** The gap between position evaluation and cluster assignment can be bridged offline during session write. Full feature-based assignment (Option B) is a post-V1 optimization.

---

## 5. Safe Integration Path — Staged Rollout

```
Stage 0: Offline demo only (current state)
  - No app changes

Stage 1: Persist user_cluster_stats from position_evaluations
  - Add clusterId to each position_evaluation entry at session write
  - Update cluster_stats JSONB per session
  - Update recent_clusters JSONB per session
  - Existing bucket recommender unchanged

Stage 2: Load hot pool as static file, behind feature flag
  - Deploy hot_pool_v0.jsonl to public/ or server-side path
  - Add ENABLE_CORPUS_RECOMMENDER=false flag
  - Load hot pool on demand (lazy, in-memory cache)

Stage 3: Corpus recommender as fallback when queues are empty
  - When exploit/explore/revisit queues are all empty AND corpus flag is ON
  - select_cluster_v0 logic reads from hot pool
  - Served position inherits clusterId from hot pool
  - Cluster stats update via normal flow

Stage 4: Corpus recommender gets small explore traffic fraction
  - Set CORPUS_RECOMMENDER_TRAFFIC_PERCENT=5
  - 5% of explore requests use corpus path, 95% use bucket path
  - A/B evaluation of quality

Stage 5: Corpus recommender gets larger traffic share
  - Based on quality metrics from Stage 4
  - Eventually replace bucket path for specific buckets/phase if quality is better
```

---

## 6. Feature Flags

```ts
// lib/training/corpus-config.ts (or .ts file)
export const CORPUS_CONFIG = {
  enabled: process.env.ENABLE_CORPUS_RECOMMENDER === "true",
  trafficPercent: parseInt(process.env.CORPUS_RECOMMENDER_TRAFFIC_PERCENT ?? "0", 10),
  hotPoolPath: process.env.CORPUS_HOT_POOL_PATH ?? "public/corpus/hot_pool_v0.jsonl",
  // Fallback when queues are empty
  fallbackEnabled: true,
  // Max distance band for position selection
  maxDistance: 10,
  minDistance: 0,
} as const;
```

```bash
ENABLE_CORPUS_RECOMMENDER=false   # default off
CORPUS_RECOMMENDER_TRAFFIC_PERCENT=0
CORPUS_HOT_POOL_PATH=public/corpus/hot_pool_v0.jsonl
```

---

## 7. Data Storage Choice

**Keep hot pool on disk/server for now.**

Rationale:
- 50k compact hot pool rows ≈ 3-5 MB JSONL
- Does not belong in Supabase free tier blob storage
- Can be served as a static file from `public/corpus/`
- No DB query latency for cluster lookup
- Reload on startup or via periodic cron (daily refresh is fine for V0)

**Later moves (post-V0):**
- SQLite/DuckDB for local hot pool with fast nearest-cluster lookup
- Paid Supabase Postgres + pg_vector for production-scale
- S3 + CDN for large hot pool files

---

## 8. Failure Modes

| Mode | Impact | Mitigation |
|---|---|---|
| Random-prior cluster choice | Corpus recommender picks uniformly, losing bandit advantage | Wait for user_cluster_stats to exist before serving |
| Cluster incoherence | Clusters contain chess-wise unrelated positions | Continue inspecting on larger samples before traffic allocation |
| Lichess eval source bias | Corpus pool skews toward intermediate-level positions | Accept as V0 known limitation; diversify sources later |
| Mate/endgame over-representation | Mate clusters are easy to cluster but not training-useful | Filter mate clusters from explore traffic in V0 |
| Opening cluster dominance | Huge opening partitions produce large meaningless clusters | Inspect and potentially collapse opening clusters |
| Repeated cluster selection | Same cluster picked repeatedly, no diversity | Implement recentClusters penalty and per-session cooldown |
| No user signal for new clusters | New clusters start with Beta(1,1), explored randomly | Accept; this is how Thompson sampling works initially |
| Bad eval/mate interpretation | Position eval data may have noise | QA eval band thresholds on larger sample |
| File loading latency | Loading hot pool JSON on cold start | Lazy-load with in-memory cache, preload on app init |

---

## 9. First App-Facing Code Patch

The first code patch should **not** be corpus serving. It should be `user_cluster_stats` persistence:

```txt
Patch 1 (Stage 1): Persist cluster_stats from position_evaluations
  - Add clusterId field to each position_evaluation entry in complete-sequence route
  - Update cluster_stats JSONB per cluster touched per session
  - Update recent_clusters JSONB per session
  - Existing bucket recommender unchanged
  - No corpus serving yet
```

Rationale: This builds the user signal that makes the corpus recommender better than random. Without this, even a perfectly implemented corpus recommender is still a random dispenser with extra steps.

---

## 10. Final Recommendation

**Do not wire corpus recommender into `/train` yet.**

The pipeline is a validated prototype. The next real step is:

1. **Stage 1 now:** Build `user_cluster_stats` persistence from existing `position_evaluations`. This gives the model a pulse — real per-cluster bandit feedback — before we let any new signal source drive serving traffic.

2. **Stage 2 later:** When user_cluster_stats has non-trivial data (say, 50+ sessions across 10+ clusters), introduce hot pool as a static file behind a feature flag, used only as a fallback.

3. **Stage 3+:** Based on quality metrics, gradually allocate traffic.

**The corpus recommender should be an evaluation tool first, a serving system second.**

---

## Summary of Recommended Sequence

| Step | Action | Risk |
|---|---|---|
| **Now** | Write this design doc | None |
| **Next** | Stage 1: cluster_stats + recent_clusters persistence | Low |
| **After** | Stage 2: hot pool static file + feature flag | Medium |
| **Later** | Stage 3: corpus fallback when queues empty | Medium |
| **Later** | Stage 4: 5% explore traffic allocation | Higher |
| **V1+** | Full corpus serving with per-cluster traffic | Highest |
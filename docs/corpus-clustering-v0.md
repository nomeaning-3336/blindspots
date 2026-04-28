# Corpus Clustering V0 — Design Doc

## Input

- `cache/corpus/lichess_eval_features.jsonl`
- `cache/corpus/feature_vector_v0_keys.json`

## Output

- `cache/corpus/lichess_eval_clusters.jsonl`
- `cache/corpus/cluster_summary_v0.json`

## Hard Partitions

Clustering happens **inside** each hard partition to prevent nonsense clusters from mixing fundamentally different positions.

Hard partition keys:

- `phase` (opening/middlegame/endgame)
- `sideToMove` (white/black)
- `source` (lichess_eval)
- `isPuzzle` (true/false)
- `materialFamily` (queenless/queens_on/rook_endgame/minor_piece_endgame/pawn_endgame/mixed_endgame)
- `evalBand` (mate/worse/equal/better)

Within each unique combination of these 6 keys, cluster the numeric features.

## Numeric Clustering Approach

V0 — keep it simple:

- Standardize numeric features (zero mean, unit variance)
- Use deterministic feature key order from `feature_vector_v0_keys.json`
- Use MiniBatchKMeans or regular KMeans (scikit-learn)
- No neural embeddings, no deep learning
- Deterministic: set `random_state=42` for reproducibility

## Initial K Rule

Apply per hard-partition group:

```
size < 100       : assign one cluster (k=1)
100 <= size < 1000 : k=3
1000 <= size < 10000 : k=8
size >= 10000    : k in [16, 32]
```

Tune k upward if intra-cluster variance is still high after inspection.

## Cluster ID Format

Deterministic readable IDs:

```
v0:{phase}:{sideToMove}:{materialFamily}:{evalBand}:{sourceKind}:{clusterIndex}
```

Example: `v0:middlegame:black:queenless:equal:lichess_eval:3`

## Output Schema — Cluster Assignments

Each row in `lichess_eval_clusters.jsonl` adds to the feature row:

```json
{
  "fen": "...",
  "clusterId": "v0:middlegame:black:queenless:equal:lichess_eval:3",
  "clusterIndex": 3,
  "distanceToCentroid": 0.42,
  ...
}
```

## Output Schema — Cluster Summary

`cluster_summary_v0.json`:

```json
{
  "generatedAt": "ISO timestamp",
  "totalClusters": 247,
  "totalPositions": 100000,
  "clusters": [
    {
      "clusterId": "v0:middlegame:black:queenless:equal:lichess_eval:3",
      "size": 847,
      "avgEvalCp": 34.2,
      "avgLegalMoveCount": 31.4,
      "puzzleShare": 0.0,
      "phaseDistribution": {"middlegame": 0.85, "endgame": 0.15},
      "materialFamilyDistribution": {"queenless": 1.0},
      "topMaterialSignatures": ["Q0R1B1N0P5-vs-Q0R1B1N0P4", ...],
      "topRepFens": ["fen1", "fen2", "fen3"],
      "withinClusterAvgDistance": 0.31,
      "nearestCentroidDistance": 0.18
    }
  ]
}
```

## Quality Checks

Define per cluster:

- candidate count
- avg evalCp
- avg legalMoveCount
- puzzle share
- phase distribution
- material family distribution
- top material signatures
- within-cluster average distance (cohesion)
- nearest centroid distance (separation)
- top representative FENs (closest to centroid)

## Failure Modes

1. **Opening positions dominate** — may create huge opening clusters that overwhelm endgame signal
2. **evalCp scale dominates** — raw centipawn dominates distance; features like king position get drowned out
3. **Puzzle contamination** — isPuzzle=false helps but some puzzle-like positions slip in
4. **Material-only clusters** — if evalCp dominates, all queens_on equal positions cluster together regardless of position quality
5. **Tiny clusters with no serving supply** — clusters with < 10 positions can't serve training
6. **Statistically tight but chess-wise nonsense** — clusters that look coherent numerically but contain strategically incoherent positions

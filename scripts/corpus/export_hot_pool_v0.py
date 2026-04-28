#!/usr/bin/env python3
"""
Hot Pool Export V0 — export a compact app-ready candidate pool from clustered rows.

Read: cache/corpus/lichess_eval_clusters.jsonl
     + cache/corpus/cluster_summary_v0.json
Write: cache/corpus/hot_pool_v0.jsonl
     + cache/corpus/hot_pool_summary_v0.json

Usage:
    python scripts/corpus/export_hot_pool_v0.py \\
        --input cache/corpus/lichess_eval_clusters.jsonl \\
        --cluster-summary cache/corpus/cluster_summary_v0.json \\
        --output cache/corpus/hot_pool_v0.jsonl \\
        --summary cache/corpus/hot_pool_summary_v0.json \\
        --max-total 50000 \\
        --max-per-cluster 100 \\
        --min-per-cluster 3 \\
        --min-cluster-size 5 \\
        --seed 42

Dependencies:
    pip install chess

Does not modify app/routes/UI/auth/serving logic.
"""

import sys
import json
import argparse
import hashlib
import random
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
try:
    import chess
except ImportError:
    sys.stderr.write(
        "Error: 'chess' package not found.\n"
        "Install it with: pip install chess\n"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Deterministic random float 0..1 from seed + fen
# ---------------------------------------------------------------------------

def deterministic_random(seed: int, fen: str) -> float:
    h = hashlib.sha256(f"{seed}:{fen}".encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


# ---------------------------------------------------------------------------
# Terminal position check
# ---------------------------------------------------------------------------

def is_terminal(fen: str) -> bool:
    try:
        board = chess.Board(fen)
        return board.is_checkmate() or board.is_stalemate() or board.is_insufficient_material()
    except Exception:
        return True  # treat invalid FEN as terminal


# ---------------------------------------------------------------------------
# Score a candidate (higher = more likely selected)
# ---------------------------------------------------------------------------

def score_candidate(row: dict, seed: int) -> float:
    quality = row.get("qualityScore") or 0.0
    dist = min(row.get("distanceToCentroid", 10), 10)
    distance_penalty = dist * 0.05
    diversity_bonus = deterministic_random(seed, row.get("fen", "")) * 0.10
    return quality - distance_penalty + diversity_bonus


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Hot Pool Export V0.")
    parser.add_argument("--input",           type=str, default="cache/corpus/lichess_eval_clusters.jsonl")
    parser.add_argument("--cluster-summary", type=str, default="cache/corpus/cluster_summary_v0.json")
    parser.add_argument("--output",          type=str, default="cache/corpus/hot_pool_v0.jsonl")
    parser.add_argument("--summary",         type=str, default="cache/corpus/hot_pool_summary_v0.json")
    parser.add_argument("--max-total",       type=int, default=50000)
    parser.add_argument("--max-per-cluster", type=int, default=100)
    parser.add_argument("--min-per-cluster", type=int, default=3)
    parser.add_argument("--min-cluster-size", type=int, default=5)
    parser.add_argument("--seed",            type=int, default=42)
    parser.add_argument("--include-vector",  action="store_true", default=False)
    args = parser.parse_args()

    input_path = Path(args.input)
    summary_path = Path(args.cluster_summary)
    output_path = Path(args.output)
    output_summary_path = Path(args.summary)

    if not input_path.exists():
        sys.stderr.write(f"Error: input file not found: {input_path}\n")
        sys.exit(1)
    if not summary_path.exists():
        sys.stderr.write(f"Error: cluster summary not found: {summary_path}\n")
        sys.exit(1)

    with open(summary_path, "r", encoding="utf-8") as f:
        cluster_summary = json.load(f)
    total_input_clusters = cluster_summary.get("totalClusters", 0)

    # --- Pass 1: group rows by clusterId ---
    rng = random.Random(args.seed)
    cluster_rows: dict = defaultdict(list)
    read_rows = 0
    skipped_invalid_fen = 0
    skipped_terminal = 0

    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                read_rows += 1
                continue
            read_rows += 1
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue

            cid = row.get("clusterId")
            if not cid:
                continue

            fen = row.get("fen", "")
            if not fen:
                skipped_invalid_fen += 1
                continue

            if is_terminal(fen):
                skipped_terminal += 1
                continue

            cluster_rows[cid].append(row)

    # --- Pass 2: deduplicate within cluster by normalizedFen ---
    for cid in cluster_rows:
        seen = set()
        deduped = []
        for row in cluster_rows[cid]:
            nf = row.get("normalizedFen", "")
            if nf and nf not in seen:
                seen.add(nf)
                deduped.append(row)
        cluster_rows[cid] = deduped

    skipped_duplicate_normalized_fen = sum(
        len(rows) - len({row.get("normalizedFen") for row in rows})
        for rows in cluster_rows.values()
    )

    # --- Pass 3: score and select per cluster ---
    selected: list[dict] = []
    output_cluster_ids: set = set()
    cluster_stats: list[dict] = []
    skipped_small_cluster = 0

    for cid, rows in cluster_rows.items():
        if len(rows) < args.min_cluster_size:
            skipped_small_cluster += len(rows)
            continue

        scored = [(score_candidate(r, args.seed), r) for r in rows]
        scored.sort(key=lambda x: -x[0])

        # Try to get at least min_per_cluster; cap at max_per_cluster
        take = min(args.max_per_cluster, len(scored))
        selected_candidates = [r for _, r in scored[:take]]

        # If fewer than min_per_cluster valid candidates, warn but still take what we have
        if len(selected_candidates) < args.min_per_cluster:
            pass  # take what we have (may be < min_per-cluster if cluster is small)

        for row in selected_candidates:
            hp = row.get("hardPartition", {})
            features = row.get("features", {})
            output_row = {
                "fen": row.get("fen"),
                "normalizedFen": row.get("normalizedFen"),
                "clusterId": cid,
                "source": row.get("source", "lichess_eval"),
                "phase": hp.get("phase", "unknown"),
                "sideToMove": hp.get("sideToMove", "unknown"),
                "materialFamily": hp.get("materialFamily", "unknown"),
                "evalBand": hp.get("evalBand", "equal"),
                "isPuzzle": hp.get("isPuzzle", False),
                "evalCp": row.get("features", {}).get("evalCpClipped", 0),
                "mate": None,
                "bestMove": row.get("bestMove") or row.get("features", {}).get("bestMove") or None,
                "legalMoveCount": features.get("legalMoveCount", 20),
                "distanceToCentroid": row.get("distanceToCentroid", 0),
                "features": {
                    "materialBalanceCpApprox": features.get("materialBalanceCpApprox", 0),
                    "legalMoveCount": features.get("legalMoveCount", 20),
                    "evalCpClipped": features.get("evalCpClipped", 0),
                    "mateSignedClipped": features.get("mateSignedClipped", 0),
                },
            }
            if args.include_vector:
                output_row["featureVectorV0"] = row.get("featureVectorV0", [])
            selected.append(output_row)
            output_cluster_ids.add(cid)

    # --- Cap total globally ---
    if args.max_total > 0 and len(selected) > args.max_total:
        selected = selected[:args.max_total]

    # --- Write output JSONL ---
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as outf:
        for row in selected:
            outf.write(json.dumps(row, ensure_ascii=False) + "\n")

    # --- Build per-cluster output stats ---
    cluster_output_counts: dict = defaultdict(int)
    for row in selected:
        cluster_output_counts[row["clusterId"]] += 1

    # Get cluster meta from cluster_summary
    summary_clusters = {c["clusterId"]: c for c in cluster_summary.get("clusters", [])}

    cluster_report: list = []
    for cid in sorted(output_cluster_ids):
        meta = summary_clusters.get(cid, {})
        pk = meta.get("partitionKey", {})
        cluster_report.append({
            "clusterId": cid,
            "inputSize": meta.get("size", 0),
            "outputSize": cluster_output_counts[cid],
            "phase": pk.get("phase", "unknown"),
            "sideToMove": pk.get("sideToMove", "unknown"),
            "materialFamily": pk.get("materialFamily", "unknown"),
            "evalBand": pk.get("evalBand", "unknown"),
            "source": pk.get("source", "unknown"),
            "isPuzzle": pk.get("isPuzzle", False),
            "avgDistanceToCentroid": meta.get("avgDistanceToCentroid", 0),
            "avgEvalCp": meta.get("avgEvalCp", 0),
            "representativeFens": meta.get("representativeFens", [])[:3],
        })

    # --- Write summary JSON ---
    output_summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "input": str(input_path),
        "totalInputRows": read_rows,
        "totalOutputRows": len(selected),
        "totalClustersInput": total_input_clusters,
        "totalClustersOutput": len(output_cluster_ids),
        "skippedInvalidFen": skipped_invalid_fen,
        "skippedTerminal": skipped_terminal,
        "skippedDuplicateNormalizedFen": skipped_duplicate_normalized_fen,
        "skippedSmallCluster": skipped_small_cluster,
        "clusters": cluster_report,
    }
    with open(output_summary_path, "w", encoding="utf-8") as sf:
        json.dump(output_summary, sf, indent=2, ensure_ascii=False)

    print(f"Read rows: {read_rows}")
    print(f"Output rows: {len(selected)}")
    print(f"Input clusters: {total_input_clusters}")
    print(f"Output clusters: {len(output_cluster_ids)}")
    print(f"Skipped invalid FEN: {skipped_invalid_fen}")
    print(f"Skipped terminal: {skipped_terminal}")
    print(f"Skipped duplicate normalizedFen: {skipped_duplicate_normalized_fen}")
    print(f"Skipped small cluster rows: {skipped_small_cluster}")
    print(f"Output: {output_path}")
    print(f"Summary: {output_summary_path}")


if __name__ == "__main__":
    main()
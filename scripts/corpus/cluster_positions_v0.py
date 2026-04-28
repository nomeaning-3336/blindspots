#!/usr/bin/env python3
"""
V0 offline clustering for normalized corpus feature rows.

Read: cache/corpus/lichess_eval_features.jsonl
     + cache/corpus/feature_vector_v0_keys.json
Write: cache/corpus/lichess_eval_clusters.jsonl
     + cache/corpus/cluster_summary_v0.json

Usage:
    python scripts/corpus/cluster_positions_v0.py \\
        --input cache/corpus/lichess_eval_features.jsonl \\
        --keys cache/corpus/feature_vector_v0_keys.json \\
        --output cache/corpus/lichess_eval_clusters.jsonl \\
        --summary cache/corpus/cluster_summary_v0.json \\
        --limit 100000

Dependencies:
    pip install scikit-learn numpy

Does not modify app/routes/UI/auth/serving logic.
"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
try:
    import numpy as np
except ImportError:
    sys.stderr.write(
        "Error: 'numpy' package not found.\n"
        "Install it with: pip install scikit-learn numpy\n"
    )
    sys.exit(1)

try:
    from sklearn.cluster import MiniBatchKMeans
    from sklearn.preprocessing import StandardScaler
except ImportError:
    sys.stderr.write(
        "Error: 'scikit-learn' package not found.\n"
        "Install it with: pip install scikit-learn numpy\n"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# K rule
# ---------------------------------------------------------------------------

def k_for_partition_size(size: int) -> int:
    if size < 100:
        return 1
    if size < 1000:
        return 3
    if size < 10000:
        return 8
    return 16


# ---------------------------------------------------------------------------
# Build partition key string
# ---------------------------------------------------------------------------

def sanitize_partition_value(val) -> str:
    if isinstance(val, bool):
        return "puzzle" if val else "nonpuzzle"
    if isinstance(val, str):
        return val.lower().replace(" ", "_")
    return str(val).lower().replace(" ", "_")


def build_cluster_id(partition: dict, source: str, cluster_index: int) -> str:
    parts = [
        "v0",
        sanitize_partition_value(partition.get("phase", "unknown")),
        sanitize_partition_value(partition.get("sideToMove", "unknown")),
        sanitize_partition_value(partition.get("materialFamily", "unknown")),
        sanitize_partition_value(partition.get("evalBand", "unknown")),
        sanitize_partition_value(source),
        sanitize_partition_value(partition.get("isPuzzle", False)),
        str(cluster_index),
    ]
    return ":".join(parts)


def build_partition_key(hp: dict, source: str) -> dict:
    return {
        "phase": hp.get("phase", "unknown"),
        "sideToMove": hp.get("sideToMove", "unknown"),
        "source": source or "unknown",
        "isPuzzle": hp.get("isPuzzle", False),
        "materialFamily": hp.get("materialFamily", "unknown"),
        "evalBand": hp.get("evalBand", "unknown"),
    }


# ---------------------------------------------------------------------------
# Euclidean distance in standardized space
# ---------------------------------------------------------------------------

def euclidean_distance(a: np.ndarray, b: np.ndarray) -> float:
    diff = a - b
    return float(np.sqrt(np.dot(diff, diff)))


# ---------------------------------------------------------------------------
# Cluster one partition group
# ---------------------------------------------------------------------------

def cluster_partition(rows: list, partition_key: dict, feature_keys: list, k: int, source_label: str):
    """
    Cluster a list of rows (all same hard partition).
    Returns list of (clustered_row, cluster_summary) tuples and per-cluster stats.
    """
    vectors = np.array([r["featureVectorV0"] for r in rows], dtype=np.float64)

    # Standardize
    scaler = StandardScaler()
    standardized = scaler.fit_transform(vectors)

    cluster_index_to_rows = defaultdict(list)
    cluster_index_to_stats = defaultdict(lambda: {
        "vectors": [],
        "eval_cps": [],
        "legal_move_counts": [],
        "puzzle_count": 0,
        "material_sigs": defaultdict(int),
    })

    if k == 1:
        centroid = np.mean(standardized, axis=0)
        for i, row in enumerate(rows):
            dist = euclidean_distance(standardized[i], centroid)
            row_out = dict(row)
            row_out["clusterId"] = build_cluster_id(partition_key, source_label, 0)
            row_out["clusterIndex"] = 0
            row_out["distanceToCentroid"] = round(dist, 6)
            cluster_index_to_rows[0].append(row_out)
            cluster_index_to_stats[0]["vectors"].append(standardized[i])
            cluster_index_to_stats[0]["eval_cps"].append(row.get("features", {}).get("evalCpClipped", 0))
            cluster_index_to_stats[0]["legal_move_counts"].append(row.get("features", {}).get("legalMoveCount") or row.get("legalMoveCount", 20))
            cluster_index_to_stats[0]["puzzle_count"] += 1 if row.get("isPuzzle", False) else 0
            msig = row.get("materialSignature") or row.get("features", {}).get("materialSignature", "")
            if msig:
                cluster_index_to_stats[0]["material_sigs"][msig] += 1
    else:
        try:
            km = MiniBatchKMeans(n_clusters=k, random_state=42, batch_size=4096, n_init="auto")
            labels = km.fit_predict(standardized)
        except TypeError:
            # older sklearn without n_init="auto"
            km = MiniBatchKMeans(n_clusters=k, random_state=42, batch_size=4096, n_init=10)
            labels = km.fit_predict(standardized)
        centroids = km.cluster_centers_

        for i, row in enumerate(rows):
            ci = int(labels[i])
            dist = euclidean_distance(standardized[i], centroids[ci])
            row_out = dict(row)
            row_out["clusterId"] = build_cluster_id(partition_key, source_label, ci)
            row_out["clusterIndex"] = ci
            row_out["distanceToCentroid"] = round(dist, 6)
            cluster_index_to_rows[ci].append(row_out)
            cluster_index_to_stats[ci]["vectors"].append(standardized[i])
            cluster_index_to_stats[ci]["eval_cps"].append(row.get("features", {}).get("evalCpClipped", 0))
            cluster_index_to_stats[ci]["legal_move_counts"].append(row.get("features", {}).get("legalMoveCount") or row.get("legalMoveCount", 20))
            cluster_index_to_stats[ci]["puzzle_count"] += 1 if row.get("isPuzzle", False) else 0
            msig = row.get("materialSignature") or row.get("features", {}).get("materialSignature", "")
            if msig:
                cluster_index_to_stats[ci]["material_sigs"][msig] += 1
            cluster_index_to_stats[ci]["puzzle_count"] += 1 if row.get("isPuzzle", False) else 0
            msig = row.get("features", {}).get("materialSignature", "")
            if msig:
                cluster_index_to_stats[ci]["material_sigs"][msig] += 1

    # Build per-cluster summary
    cluster_summaries = []
    for ci in sorted(cluster_index_to_rows.keys()):
        stats = cluster_index_to_stats[ci]
        vecs = np.array(stats["vectors"])
        centroid = np.mean(vecs, axis=0)
        dists = [euclidean_distance(v, centroid) for v in vecs]
        avg_dist = float(np.mean(dists)) if dists else 0.0
        max_dist = float(np.max(dists)) if dists else 0.0

        # Representative FENs: closest 3 to centroid
        idx_dist = [(j, dists[j]) for j in range(len(dists))]
        idx_dist.sort(key=lambda x: x[1])
        rep_fens = [cluster_index_to_rows[ci][j]["fen"] for j, _ in idx_dist[:3]]

        # Top material signatures
        top_sigs = sorted(stats["material_sigs"].items(), key=lambda x: -x[1])[:5]

        eval_cps = stats["eval_cps"]
        lmc = stats["legal_move_counts"]
        cluster_summaries.append({
            "clusterId": build_cluster_id(partition_key, source_label, ci),
            "clusterIndex": ci,
            "size": len(cluster_index_to_rows[ci]),
            "avgEvalCp": round(float(np.mean(eval_cps)) if eval_cps else 0.0, 2),
            "avgLegalMoveCount": round(float(np.mean(lmc)) if lmc else 0.0, 2),
            "puzzleShare": round(stats["puzzle_count"] / len(cluster_index_to_rows[ci]), 4),
            "avgDistanceToCentroid": round(avg_dist, 4),
            "maxDistanceToCentroid": round(max_dist, 4),
            "topMaterialSignatures": [[sig, cnt] for sig, cnt in top_sigs],
            "representativeFens": rep_fens,
        })

    all_clustered_rows = []
    for ci in sorted(cluster_index_to_rows.keys()):
        all_clustered_rows.extend(cluster_index_to_rows[ci])

    return all_clustered_rows, cluster_summaries


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="V0 offline clustering for corpus feature rows.")
    parser.add_argument("--input",  type=str, default="cache/corpus/lichess_eval_features.jsonl")
    parser.add_argument("--keys",   type=str, default="cache/corpus/feature_vector_v0_keys.json")
    parser.add_argument("--output", type=str, default="cache/corpus/lichess_eval_clusters.jsonl")
    parser.add_argument("--summary", type=str, default="cache/corpus/cluster_summary_v0.json")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    input_path = Path(args.input)
    keys_path = Path(args.keys)
    output_path = Path(args.output)
    summary_path = Path(args.summary)

    if not input_path.exists():
        sys.stderr.write(f"Error: input file not found: {input_path}\n")
        sys.exit(1)
    if not keys_path.exists():
        sys.stderr.write(f"Error: keys file not found: {keys_path}\n")
        sys.exit(1)

    with open(keys_path, "r", encoding="utf-8") as f:
        feature_keys = json.load(f)
    key_count = len(feature_keys)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.parent.mkdir(parents=True, exist_ok=True)

    # --- Pass 1: group rows by hard partition ---
    partitions: dict = defaultdict(list)
    read_rows = 0
    skipped_malformed = 0
    skipped_missing_vector = 0
    skipped_length_mismatch = 0

    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            if args.limit > 0 and read_rows >= args.limit:
                break
            line = line.strip()
            if not line:
                read_rows += 1
                continue
            read_rows += 1
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                skipped_malformed += 1
                continue

            fv = row.get("featureVectorV0")
            if fv is None:
                skipped_missing_vector += 1
                continue
            if not isinstance(fv, list) or len(fv) != key_count:
                skipped_length_mismatch += 1
                continue

            hp = row.get("hardPartition", {})
            source = row.get("source", "unknown")
            pk = build_partition_key(hp, source)
            pk_str = json.dumps(pk, sort_keys=True)
            partitions[pk_str].append(row)

    # --- Pass 2: cluster each partition ---
    all_clustered_rows = []
    all_cluster_summaries = []
    total_clusters = 0

    for pk_str, rows in partitions.items():
        partition_key = json.loads(pk_str)
        k = k_for_partition_size(len(rows))
        k = min(k, len(rows))
        source_label = partition_key.get("source", "unknown")

        clustered, summaries = cluster_partition(
            rows, partition_key, feature_keys, k, source_label
        )
        all_clustered_rows.extend(clustered)
        for s in summaries:
            s["partitionKey"] = partition_key
        all_cluster_summaries.extend(summaries)
        total_clusters += len(summaries)

    # --- Write output JSONL ---
    with open(output_path, "w", encoding="utf-8") as outf:
        for row in all_clustered_rows:
            outf.write(json.dumps(row, ensure_ascii=False) + "\n")

    # --- Write summary JSON ---
    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "input": str(input_path),
        "totalPositions": len(all_clustered_rows),
        "totalPartitions": len(partitions),
        "totalClusters": total_clusters,
        "featureKeys": feature_keys,
        "clusters": all_cluster_summaries,
    }
    with open(summary_path, "w", encoding="utf-8") as sf:
        json.dump(summary, sf, indent=2, ensure_ascii=False)

    print(f"Read rows: {read_rows}")
    print(f"Clusterable rows: {len(all_clustered_rows)}")
    print(f"Skipped malformed: {skipped_malformed}")
    print(f"Skipped missing vector: {skipped_missing_vector}")
    print(f"Skipped vector length mismatch: {skipped_length_mismatch}")
    print(f"Partitions: {len(partitions)}")
    print(f"Clusters: {total_clusters}")
    print(f"Output: {output_path}")
    print(f"Summary: {summary_path}")


if __name__ == "__main__":
    main()

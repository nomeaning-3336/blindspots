#!/usr/bin/env python3
"""
Local cluster selection V0 prototype.

chooseCluster(user_ctx) -> getPosition(cluster_id, user_ctx)

Uses Thompson sampling over weakness probability (Beta distribution),
with recent/mastered/supply penalties. Then selects a position from the
chosen cluster using the same logic as get_position_v0.py.

Does NOT wire into /train. Pure offline prototype.
"""

import sys
import json
import argparse
import random
import hashlib
from pathlib import Path

try:
    import chess
except ImportError:
    sys.stderr.write(
        "Error: 'chess' package not found.\n"
        "Install it with: pip install chess\n"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Deterministic noise
# ---------------------------------------------------------------------------

def deterministic_noise(seed: int, fen: str, max_val: float = 0.05) -> float:
    h = hashlib.sha256(f"{seed}:{fen}".encode()).hexdigest()
    return (int(h[:8], 16) / 0xFFFFFFFF) * max_val


# ---------------------------------------------------------------------------
# Terminal check
# ---------------------------------------------------------------------------

def is_terminal(fen: str) -> bool:
    try:
        board = chess.Board(fen)
        return board.is_checkmate() or board.is_stalemate() or board.is_insufficient_material()
    except Exception:
        return True


# ---------------------------------------------------------------------------
# Select position from hot pool for a given cluster
# ---------------------------------------------------------------------------

def select_position_from_cluster(hot_pool_path: Path, cluster_id: str,
                                  min_dist: float = 0.0, max_dist: float = 999.0,
                                  recent_fens: set = None, exclude_fens: set = None,
                                  seed: int = 42) -> dict:
    """Return selected candidate dict (same shape as get_position_v0 output)."""
    if recent_fens is None:
        recent_fens = set()
    if exclude_fens is None:
        exclude_fens = set()
    recent_normalized = set()
    for f in recent_fens:
        parts = f.split()
        if len(parts) >= 4:
            recent_normalized.add(" ".join(parts[:4]))

    candidates = []
    total_scanned = 0
    cluster_rows = 0
    excl_recent = excl_exclude = excl_dist = excl_term = 0

    with open(hot_pool_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            total_scanned += 1
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue

            if row.get("clusterId") != cluster_id:
                continue
            cluster_rows += 1
            fen = row.get("fen", "")
            norm_fen = row.get("normalizedFen", "")

            if fen in recent_fens or (norm_fen and norm_fen in recent_normalized):
                excl_recent += 1
                continue
            if fen in exclude_fens:
                excl_exclude += 1
                continue

            dist = row.get("distanceToCentroid", 0)
            if dist < min_dist or dist > max_dist:
                excl_dist += 1
                continue
            if is_terminal(fen):
                excl_term += 1
                continue

            candidates.append(row)

    if not candidates:
        return {
            "error": "no candidates",
            "totalScanned": total_scanned,
            "clusterRows": cluster_rows,
            "excludedByRecent": excl_recent,
            "excludedByExcludeFen": excl_exclude,
            "excludedByDistance": excl_dist,
            "excludedByTerminal": excl_term,
        }

    distances = sorted([c.get("distanceToCentroid", 0) for c in candidates])
    n = len(distances)
    target_distance = distances[n // 2]

    scored = []
    for c in candidates:
        dist = c.get("distanceToCentroid", 0)
        proximity = -abs(dist - target_distance)
        noise = deterministic_noise(seed, c.get("fen", ""), max_val=0.05)
        score = proximity + noise
        scored.append((score, dist, c))

    scored.sort(key=lambda x: -x[0])
    sel_score, sel_dist, sel_row = scored[0]
    selection = dict(sel_row)
    selection["selectionScore"] = round(sel_score, 6)
    selection["selectionReason"] = {
        "clusterId": cluster_id,
        "targetDistance": round(target_distance, 4),
        "totalScanned": total_scanned,
        "clusterRows": cluster_rows,
        "excludedByRecent": excl_recent,
        "excludedByExcludeFen": excl_exclude,
        "excludedByDistance": excl_dist,
        "excludedByTerminal": excl_term,
        "candidateCount": len(candidates),
        "selectedIndex": 0,
    }
    return selection


# ---------------------------------------------------------------------------
# Thompson sampling with penalties
# ---------------------------------------------------------------------------

def sample_clusters(clusters_meta, user_stats, seed, recent_penalty=0.20,
                    supply_penalty=0.10, supply_threshold=10):
    """Return sorted list of (score, cluster_meta) for eligible clusters."""
    rng = random.Random(seed)
    results = []

    for cm in clusters_meta:
        cid = cm["clusterId"]
        output_size = cm.get("outputSize", 0)

        # Eligibility
        if output_size < 3:
            continue

        # User stats
        ustats = (user_stats or {}).get("clusters", {}).get(cid)
        if ustats:
            alpha = ustats.get("posteriorAlpha", 1)
            beta = ustats.get("posteriorBeta", 1)
        else:
            alpha = 1
            beta = 1

        # Thompson sample — higher Beta = more weakness
        sample = rng.betavariate(alpha, beta)
        score = sample

        # Penalize recently served
        recent_clusters = (user_stats or {}).get("recentClusters", [])
        if cid in recent_clusters:
            score -= recent_penalty

        # Penalize tiny supply
        if output_size < supply_threshold:
            score -= supply_penalty

        score = max(0.0, score)
        results.append((score, cm, alpha, beta))

    results.sort(key=lambda x: -x[0])
    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Local cluster selection V0 prototype.")
    parser.add_argument("--hot-pool",     type=str, default="cache/corpus/hot_pool_v0.jsonl")
    parser.add_argument("--summary",      type=str, default="cache/corpus/hot_pool_summary_v0.json")
    parser.add_argument("--user-stats",   type=str, default=None)
    parser.add_argument("--recent-fen-file", type=str, default=None)
    parser.add_argument("--exclude-fen",  action="append", default=[])
    parser.add_argument("--seed",         type=int, default=42)
    parser.add_argument("--top-k-clusters", type=int, default=10)
    parser.add_argument("--json",         action="store_true", default=False)
    args = parser.parse_args()

    hot_pool_path = Path(args.hot_pool)
    summary_path = Path(args.summary)
    if not hot_pool_path.exists():
        sys.stderr.write(f"Error: hot pool not found: {hot_pool_path}\n")
        sys.exit(1)
    if not summary_path.exists():
        sys.stderr.write(f"Error: summary not found: {summary_path}\n")
        sys.exit(1)

    # Load user stats
    user_stats = None
    if args.user_stats and args.user_stats.lower() != "none":
        up = Path(args.user_stats)
        if up.exists():
            with open(up, "r", encoding="utf-8") as f:
                user_stats = json.load(f)

    # Load cluster summary
    with open(summary_path, "r", encoding="utf-8") as f:
        summary = json.load(f)

    # Build cluster metadata list
    all_clusters = summary.get("clusters", [])
    mastered_clusters = set()
    if user_stats:
        mastered_clusters = set(user_stats.get("masteredClusters", []))

    eligible = [
        c for c in all_clusters
        if c.get("outputSize", 0) >= 3 and c.get("clusterId") not in mastered_clusters
    ]

    if not eligible:
        sys.stderr.write("Error: no eligible clusters.\n")
        sys.exit(1)

    # Thompson sample + penalize
    scored_clusters = sample_clusters(
        eligible, user_stats, args.seed,
        recent_penalty=0.20, supply_penalty=0.10, supply_threshold=10
    )

    # Pick top cluster
    top_score, top_cm, top_alpha, top_beta = scored_clusters[0]
    selected_cid = top_cm["clusterId"]

    # Load recent FENs
    recent_fens = set()
    if args.recent_fen_file:
        rp = Path(args.recent_fen_file)
        if rp.exists():
            for line in rp.read_text().splitlines():
                line = line.strip()
                if line:
                    recent_fens.add(line)

    exclude_fens = set(args.exclude_fen)

    # Select position
    pos_result = select_position_from_cluster(
        hot_pool_path, selected_cid,
        min_dist=0.0, max_dist=999.0,
        recent_fens=recent_fens,
        exclude_fens=exclude_fens,
        seed=args.seed
    )

    # Build top clusters summary
    top_k_display = scored_clusters[:args.top_k_clusters]

    # Prepare output
    selected_cluster_info = {
        "clusterId": selected_cid,
        "score": round(top_score, 6),
        "sampledWeakness": round(top_score, 6),
        "alpha": top_alpha,
        "beta": top_beta,
        "outputSize": top_cm.get("outputSize", 0),
        "phase": top_cm.get("phase", "unknown"),
        "sideToMove": top_cm.get("sideToMove", "unknown"),
        "materialFamily": top_cm.get("materialFamily", "unknown"),
        "evalBand": top_cm.get("evalBand", "unknown"),
        "source": top_cm.get("source", "unknown"),
        "isPuzzle": top_cm.get("isPuzzle", False),
    }

    top_clusters_list = [
        {
            "clusterId": cm["clusterId"],
            "score": round(score, 6),
            "alpha": alpha,
            "beta": beta,
            "outputSize": cm.get("outputSize", 0),
            "phase": cm.get("phase", ""),
            "sideToMove": cm.get("sideToMove", ""),
            "materialFamily": cm.get("materialFamily", ""),
            "evalBand": cm.get("evalBand", ""),
        }
        for score, cm, alpha, beta in top_k_display
    ]

    if args.json:
        output = {
            "selectedCluster": selected_cluster_info,
            "topClusters": top_clusters_list,
            "selectedPosition": pos_result,
        }
        print(json.dumps(output, ensure_ascii=False))
        return

    # Human-readable
    print("=== Selected Cluster ===")
    print(f"  clusterId: {selected_cluster_info['clusterId']}")
    print(f"  score: {selected_cluster_info['score']}")
    print(f"  sampledWeakness: {selected_cluster_info['sampledWeakness']}")
    print(f"  alpha={top_alpha} beta={top_beta}")
    print(f"  outputSize={top_cm.get('outputSize', 0)}")
    print(f"  phase={selected_cluster_info['phase']} sideToMove={selected_cluster_info['sideToMove']}")
    print(f"  materialFamily={selected_cluster_info['materialFamily']} evalBand={selected_cluster_info['evalBand']}")
    print()

    print(f"=== Top {len(top_k_display)} Cluster Candidates ===")
    print(f"  {'#':>2}  {'clusterId':<70}  {'score':>6}  {'alpha':>5}  {'beta':>5}  {'size':>4}  phase")
    print(f"  {'-'*2}  {'-'*70}  {'-'*6}  {'-'*5}  {'-'*5}  {'-'*4}  {'-'*8}")
    for i, (score, cm, alpha, beta) in enumerate(top_k_display):
        print(f"  {i+1:>2}  {cm['clusterId']:<70}  {score:>6.4f}  {alpha:>5}  {beta:>5}  {cm.get('outputSize',0):>4}  {cm.get('phase','')}")
    print()

    if "error" in pos_result:
        print("=== Selected Position ===")
        print(f"  ERROR: {pos_result['error']}")
        print(f"  total scanned: {pos_result.get('totalScanned','?')}")
        print(f"  cluster rows: {pos_result.get('clusterRows','?')}")
        print(f"  excluded: recent={pos_result.get('excludedByRecent','?')} "
              f"exclude-fen={pos_result.get('excludedByExcludeFen','?')} "
              f"dist={pos_result.get('excludedByDistance','?')} "
              f"terminal={pos_result.get('excludedByTerminal','?')}")
    else:
        print("=== Selected Position ===")
        print(f"  FEN: {pos_result.get('fen')}")
        print(f"  clusterId: {pos_result.get('clusterId')}")
        print(f"  phase: {pos_result.get('phase')}  sideToMove: {pos_result.get('sideToMove')}")
        print(f"  materialFamily: {pos_result.get('materialFamily')}  evalBand: {pos_result.get('evalBand')}")
        print(f"  evalCp: {pos_result.get('evalCp')}  legalMoveCount: {pos_result.get('legalMoveCount')}")
        print(f"  distanceToCentroid: {pos_result.get('distanceToCentroid')}")
        print(f"  selectionScore: {pos_result.get('selectionScore')}")
        print()
        print(f"  Filtering: scanned={pos_result.get('selectionReason',{}).get('totalScanned','?')} "
              f"clusterRows={pos_result.get('selectionReason',{}).get('clusterRows','?')} "
              f"candidates={pos_result.get('selectionReason',{}).get('candidateCount','?')}")


if __name__ == "__main__":
    main()
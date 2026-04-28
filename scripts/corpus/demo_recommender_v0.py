#!/usr/bin/env python3
"""
End-to-end local corpus recommender demo V0.

Runs the full offline recommendation loop from existing hot pool artifacts:
  load summary -> select cluster (Thompson sampling) -> select position -> report

Does NOT wire into /train. Pure offline prototype.

Usage:
    python scripts/corpus/demo_recommender_v0.py \\
        --hot-pool cache/corpus/hot_pool_v0_10k.jsonl \\
        --summary cache/corpus/hot_pool_summary_v0_10k.json \\
        --user-stats scripts/corpus/user_cluster_stats_example.json \\
        --seed 42 \\
        --top-k-clusters 10

    python scripts/corpus/demo_recommender_v0.py \\
        --hot-pool cache/corpus/hot_pool_v0_10k.jsonl \\
        --summary cache/corpus/hot_pool_summary_v0_10k.json \\
        --seed 42 --json
"""

import sys
import json
import argparse
import random
import hashlib
from pathlib import Path

import chess

# ---------------------------------------------------------------------------
# Deterministic noise (same as select_cluster_v0.py)
# ---------------------------------------------------------------------------

def deterministic_noise(seed: int, fen: str, max_val: float = 0.05) -> float:
    h = hashlib.sha256(f"{seed}:{fen}".encode()).hexdigest()
    return (int(h[:8], 16) / 0xFFFFFFFF) * max_val


def is_terminal(fen: str) -> bool:
    try:
        board = chess.Board(fen)
        return board.is_checkmate() or board.is_stalemate() or board.is_insufficient_material()
    except Exception:
        return True


# ---------------------------------------------------------------------------
# Position selection (same logic as get_position_v0.py / select_cluster_v0.py)
# ---------------------------------------------------------------------------

def select_position(hot_pool_path: Path, cluster_id: str,
                   min_dist=0.0, max_dist=999.0,
                   recent_fens=None, exclude_fens=None,
                   seed=42):
    if recent_fens is None:
        recent_fens = set()
    if exclude_fens is None:
        exclude_fens = set()
    recent_norm = set()
    for f in recent_fens:
        parts = f.split()
        if len(parts) >= 4:
            recent_norm.add(" ".join(parts[:4]))

    candidates = []
    total = cluster_rows = excl_recent = excl_exclude = excl_dist = excl_term = 0

    with open(hot_pool_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            total += 1
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if row.get("clusterId") != cluster_id:
                continue
            cluster_rows += 1
            fen = row.get("fen", "")
            nf = row.get("normalizedFen", "")
            if fen in recent_fens or (nf and nf in recent_norm):
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
        return None, {
            "totalScanned": total, "clusterRows": cluster_rows,
            "excludedByRecent": excl_recent, "excludedByExcludeFen": excl_exclude,
            "excludedByDistance": excl_dist, "excludedByTerminal": excl_term,
            "candidates": 0,
        }

    distances = sorted([c.get("distanceToCentroid", 0) for c in candidates])
    target = distances[len(distances) // 2]

    scored = []
    for c in candidates:
        d = c.get("distanceToCentroid", 0)
        score = -abs(d - target) + deterministic_noise(seed, c.get("fen", ""), 0.05)
        scored.append((score, d, c))
    scored.sort(key=lambda x: -x[0])

    sel_score, sel_dist, sel_row = scored[0]
    result = dict(sel_row)
    result["selectionScore"] = round(sel_score, 6)
    result["selectionReason"] = {
        "clusterId": cluster_id,
        "targetDistance": round(target, 4),
        "totalScanned": total,
        "clusterRows": cluster_rows,
        "excludedByRecent": excl_recent,
        "excludedByExcludeFen": excl_exclude,
        "excludedByDistance": excl_dist,
        "excludedByTerminal": excl_term,
        "candidateCount": len(candidates),
        "selectedIndex": 0,
    }
    return result, scored


# ---------------------------------------------------------------------------
# Thompson sampling + cluster selection (same as select_cluster_v0.py)
# ---------------------------------------------------------------------------

def select_cluster(summary_path: Path, user_stats, seed,
                  recent_penalty=0.20, supply_penalty=0.10, supply_threshold=10):
    with open(summary_path, "r", encoding="utf-8") as f:
        summary = json.load(f)

    all_clusters = summary.get("clusters", [])
    mastered = set((user_stats or {}).get("masteredClusters", []))

    eligible = [
        c for c in all_clusters
        if c.get("outputSize", 0) >= 3 and c.get("clusterId") not in mastered
    ]

    rng = random.Random(seed)
    results = []

    for cm in eligible:
        cid = cm["clusterId"]
        ustats = (user_stats or {}).get("clusters", {}).get(cid)
        if ustats:
            alpha = ustats.get("posteriorAlpha", 1)
            beta = ustats.get("posteriorBeta", 1)
        else:
            alpha = 1
            beta = 1

        sample = rng.betavariate(alpha, beta)
        score = sample

        recent = (user_stats or {}).get("recentClusters", [])
        if cid in recent:
            score -= recent_penalty
        if cm.get("outputSize", 0) < supply_threshold:
            score -= supply_penalty
        score = max(0.0, score)
        results.append((score, cm, alpha, beta))

    results.sort(key=lambda x: -x[0])
    return results


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="End-to-end corpus recommender demo V0.")
    parser.add_argument("--hot-pool",        type=str, default="cache/corpus/hot_pool_v0.jsonl")
    parser.add_argument("--summary",          type=str, default="cache/corpus/hot_pool_summary_v0.json")
    parser.add_argument("--user-stats",       type=str, default=None)
    parser.add_argument("--recent-fen-file",  type=str, default=None)
    parser.add_argument("--exclude-fen",      action="append", default=[])
    parser.add_argument("--seed",             type=int, default=42)
    parser.add_argument("--top-k-clusters",   type=int, default=10)
    parser.add_argument("--json",            action="store_true", default=False)
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

    # Load recent FENs
    recent_fens = set()
    if args.recent_fen_file:
        rp = Path(args.recent_fen_file)
        if rp.exists():
            for line in rp.read_text().splitlines():
                if line.strip():
                    recent_fens.add(line.strip())

    exclude_fens = set(args.exclude_fen)

    # Select cluster
    scored_clusters = select_cluster(summary_path, user_stats, args.seed)
    if not scored_clusters:
        sys.stderr.write("Error: no eligible clusters.\n")
        sys.exit(1)

    top_score, top_cm, top_alpha, top_beta = scored_clusters[0]
    selected_cid = top_cm["clusterId"]
    top_k = scored_clusters[:args.top_k_clusters]

    # Select position
    recent_fens_filter = recent_fens if recent_fens else None
    sel_pos, scored_pos = select_position(
        hot_pool_path, selected_cid,
        min_dist=0.0, max_dist=999.0,
        recent_fens=recent_fens_filter,
        exclude_fens=exclude_fens,
        seed=args.seed
    )

    # Build result objects
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
        for score, cm, alpha, beta in top_k
    ]

    inputs_info = {
        "hotPool": str(hot_pool_path),
        "summary": str(summary_path),
        "userStats": str(user_stats) if user_stats else None,
        "seed": args.seed,
    }

    if args.json:
        output = {
            "selectedCluster": selected_cluster_info,
            "selectedPosition": sel_pos,
            "topClusters": top_clusters_list,
            "inputs": inputs_info,
        }
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return

    # Human-readable output
    print("Blindspots Corpus Recommender V0 Demo")
    print()
    print("Inputs:")
    print(f"  hotPool: {hot_pool_path}")
    print(f"  summary: {summary_path}")
    print(f"  userStats: {args.user_stats or 'none'}")
    print(f"  seed: {args.seed}")
    print()
    print("Selected cluster:")
    print(f"  clusterId: {selected_cluster_info['clusterId']}")
    print(f"  score: {selected_cluster_info['score']:.6f}")
    print(f"  sampledWeakness: {selected_cluster_info['sampledWeakness']:.6f}")
    print(f"  alpha={top_alpha} beta={top_beta}")
    print(f"  outputSize={top_cm.get('outputSize', 0)}")
    print(f"  phase={selected_cluster_info['phase']} sideToMove={selected_cluster_info['sideToMove']}")
    print(f"  materialFamily={selected_cluster_info['materialFamily']} evalBand={selected_cluster_info['evalBand']}")
    print()
    print("Why this cluster:")
    ustats = (user_stats or {}).get("clusters", {}).get(selected_cid)
    if ustats:
        print(f"  - user has stats: alpha={ustats.get('posteriorAlpha')} beta={ustats.get('posteriorBeta')}")
    else:
        print(f"  - no user stats, default prior alpha=1 beta=1")
    recent = (user_stats or {}).get("recentClusters", [])
    print(f"  - {'recently served (penalized)' if selected_cid in recent else 'not recently served'}")
    mastered = (user_stats or {}).get("masteredClusters", [])
    print(f"  - {'mastered (would skip)' if selected_cid in mastered else 'not mastered'}")
    print(f"  - supply: {top_cm.get('outputSize', 0)} positions available")
    print(f"  - Thompson sampled weakness: {top_score:.6f}")
    print()
    print("Selected position:")
    print(f"  fen: {sel_pos.get('fen')}")
    print(f"  evalCp: {sel_pos.get('evalCp')}  mate: {sel_pos.get('mate')}")
    print(f"  phase: {sel_pos.get('phase')}  sideToMove: {sel_pos.get('sideToMove')}")
    print(f"  materialFamily: {sel_pos.get('materialFamily')}  evalBand: {sel_pos.get('evalBand')}")
    print(f"  legalMoveCount: {sel_pos.get('legalMoveCount')}")
    print(f"  distanceToCentroid: {sel_pos.get('distanceToCentroid')}")
    print(f"  selectionScore: {sel_pos.get('selectionScore')}")
    print()
    print(f"Top {len(top_k)} cluster candidates:")
    print(f"  {'#':>2}  {'clusterId':<65}  {'score':>7}  {'alpha':>5}  {'beta':>5}  {'size':>4}  phase")
    print(f"  {'-'*2}  {'-'*65}  {'-'*7}  {'-'*5}  {'-'*5}  {'-'*4}  {'-'*8}")
    for i, (score, cm, alpha, beta) in enumerate(top_k):
        print(f"  {i+1:>2}  {cm['clusterId']:<65}  {score:>7.4f}  {alpha:>5}  {beta:>5}  {cm.get('outputSize',0):>4}  {cm.get('phase','')}")


if __name__ == "__main__":
    main()
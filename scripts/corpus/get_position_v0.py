#!/usr/bin/env python3
"""
Local getPosition V0 prototype — select a position from hot_pool_v0.jsonl.

Mimics future:
  getPosition(cluster_id, user_ctx)

Does NOT wire into /train. Pure offline prototype.

Usage:
    python scripts/corpus/get_position_v0.py \\
        --hot-pool cache/corpus/hot_pool_v0.jsonl \\
        --cluster-id "v0:middlegame:black:mixed_endgame:equal:lichess_eval:nonpuzzle:0" \\
        --recent-fen-file cache/corpus/recent_fens_example.txt \\
        --max-distance 8 \\
        --min-distance 0.2 \\
        --seed 42 \\
        --json

    python scripts/corpus/get_position_v0.py \\
        --hot-pool cache/corpus/hot_pool_v0.jsonl \\
        --cluster-id "v0:middlegame:black:mixed_endgame:equal:lichess_eval:nonpuzzle:0" \\
        --top-k 5

Dependencies:
    pip install chess
"""

import sys
import json
import argparse
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
# Deterministic noise: sha256(seed, fen) -> float in [0, 1]
# ---------------------------------------------------------------------------

def deterministic_noise(seed: int, fen: str, max_val: float = 0.05) -> float:
    h = hashlib.sha256(f"{seed}:{fen}".encode()).hexdigest()
    return (int(h[:8], 16) / 0xFFFFFFFF) * max_val


# ---------------------------------------------------------------------------
# Terminal position check
# ---------------------------------------------------------------------------

def is_terminal(fen: str) -> bool:
    try:
        board = chess.Board(fen)
        return board.is_checkmate() or board.is_stalemate() or board.is_insufficient_material()
    except Exception:
        return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Local getPosition V0 prototype.")
    parser.add_argument("--hot-pool",       type=str, required=True)
    parser.add_argument("--cluster-id",      type=str, required=True)
    parser.add_argument("--recent-fen-file", type=str, default=None)
    parser.add_argument("--exclude-fen",   action="append", default=[])
    parser.add_argument("--min-distance",  type=float, default=0.0)
    parser.add_argument("--max-distance",  type=float, default=999.0)
    parser.add_argument("--seed",           type=int, default=42)
    parser.add_argument("--json",           action="store_true", default=False)
    parser.add_argument("--top-k",          type=int, default=10)
    args = parser.parse_args()

    hot_pool_path = Path(args.hot_pool)
    if not hot_pool_path.exists():
        sys.stderr.write(f"Error: hot pool file not found: {hot_pool_path}\n")
        sys.exit(1)

    # Load recent FENs
    recent_fens: set = set()
    recent_normalized: set = set()
    if args.recent_fen_file:
        rf_path = Path(args.recent_fen_file)
        if rf_path.exists():
            for line in rf_path.read_text().splitlines():
                line = line.strip()
                if line:
                    recent_fens.add(line)
                    # Derive normalized Fen (drop halfmove/fullmove)
                    parts = line.split()
                    if len(parts) >= 4:
                        recent_normalized.add(" ".join(parts[:4]))

    exclude_fens = set(args.exclude_fen)

    # Collect candidates from hot pool
    candidates = []
    total_scanned = 0
    cluster_rows = 0
    excluded_recent = 0
    excluded_exclude = 0
    excluded_distance = 0
    excluded_terminal = 0

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

            if row.get("clusterId") != args.cluster_id:
                continue

            cluster_rows += 1
            fen = row.get("fen", "")
            norm_fen = row.get("normalizedFen", "")

            # Filter: recent FENs
            if fen in recent_fens or (norm_fen and norm_fen in recent_normalized):
                excluded_recent += 1
                continue

            # Filter: explicit exclude FENs
            if fen in exclude_fens:
                excluded_exclude += 1
                continue

            # Filter: distance band
            dist = row.get("distanceToCentroid", 0)
            if dist < args.min_distance or dist > args.max_distance:
                excluded_distance += 1
                continue

            # Filter: terminal
            if is_terminal(fen):
                excluded_terminal += 1
                continue

            candidates.append(row)

    # Check cluster found
    if cluster_rows == 0:
        # Suggest available cluster IDs
        sys.stderr.write(f"Error: cluster '{args.cluster_id}' not found in hot pool.\n")
        sys.stderr.write(f"Top available clusters (by row count):\n")
        cluster_counts: dict = {}
        with open(hot_pool_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                cid = row.get("clusterId", "unknown")
                cluster_counts[cid] = cluster_counts.get(cid, 0) + 1
        top_clusters = sorted(cluster_counts.items(), key=lambda x: -x[1])[:10]
        for cid, cnt in top_clusters:
            sys.stderr.write(f"  {cid}  ({cnt} rows)\n")
        sys.exit(1)

    # Check candidates available
    if not candidates:
        sys.stderr.write(
            f"Error: no candidates match filters for cluster '{args.cluster_id}'.\n"
            f"  total scanned: {total_scanned}\n"
            f"  cluster rows: {cluster_rows}\n"
            f"  excluded by recent: {excluded_recent}\n"
            f"  excluded by exclude-fen: {excluded_exclude}\n"
            f"  excluded by distance [{args.min_distance}, {args.max_distance}]: {excluded_distance}\n"
            f"  excluded by terminal: {excluded_terminal}\n"
        )
        sys.exit(1)

    # Determine target distance
    if args.max_distance >= 999.0:
        # Use median distance as target
        distances = sorted([c.get("distanceToCentroid", 0) for c in candidates])
        n = len(distances)
        target_distance = distances[n // 2]
    else:
        target_distance = (args.min_distance + args.max_distance) / 2.0

    # Score candidates: closer to target + deterministic noise
    scored = []
    for c in candidates:
        dist = c.get("distanceToCentroid", 0)
        proximity = -abs(dist - target_distance)
        noise = deterministic_noise(args.seed, c.get("fen", ""), max_val=0.05)
        score = proximity + noise
        scored.append((score, dist, c))

    scored.sort(key=lambda x: -x[0])

    # Build selection result
    sel_score, sel_dist, sel_row = scored[0]
    selection = dict(sel_row)
    selection["selectionScore"] = round(sel_score, 6)
    selection["selectionReason"] = {
        "clusterId": args.cluster_id,
        "targetDistance": round(target_distance, 4),
        "totalScanned": total_scanned,
        "clusterRows": cluster_rows,
        "excludedByRecent": excluded_recent,
        "excludedByExcludeFen": excluded_exclude,
        "excludedByDistance": excluded_distance,
        "excludedByTerminal": excluded_terminal,
        "candidateCount": len(candidates),
        "selectedIndex": 0,
    }

    # Print
    if args.json:
        print(json.dumps(selection, ensure_ascii=False))
    else:
        print("=== Selected Position ===")
        print(f"  FEN: {selection.get('fen')}")
        print(f"  clusterId: {selection.get('clusterId')}")
        print(f"  phase: {selection.get('phase')}  sideToMove: {selection.get('sideToMove')}")
        print(f"  materialFamily: {selection.get('materialFamily')}  evalBand: {selection.get('evalBand')}")
        print(f"  evalCp: {selection.get('evalCp')}  legalMoveCount: {selection.get('legalMoveCount')}")
        print(f"  distanceToCentroid: {selection.get('distanceToCentroid')}")
        print(f"  selectionScore: {selection.get('selectionScore')}")
        print(f"  targetDistance: {target_distance:.4f}")
        print()
        print("=== Filtering Summary ===")
        print(f"  total scanned: {total_scanned}")
        print(f"  cluster rows: {cluster_rows}")
        print(f"  excluded by recent: {excluded_recent}")
        print(f"  excluded by exclude-fen: {excluded_exclude}")
        print(f"  excluded by distance: {excluded_distance}")
        print(f"  excluded by terminal: {excluded_terminal}")
        print(f"  candidates: {len(candidates)}")
        print()
        print(f"=== Top {min(args.top_k, len(scored))} Candidates ===")
        for i, (score, dist, c) in enumerate(scored[:args.top_k]):
            print(f"  {i+1}. score={score:.4f} dist={dist:.4f} fen={c.get('fen', '')[:60]}")
        print()
        print(f"Output as JSON: re-run with --json")


if __name__ == "__main__":
    main()
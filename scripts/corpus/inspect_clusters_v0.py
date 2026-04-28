#!/usr/bin/env python3
"""
Inspect cluster_summary_v0.json and produce a human-readable report.

Usage:
    python scripts/corpus/inspect_clusters_v0.py \\
        --summary cache/corpus/cluster_summary_v0.json \\
        --output cache/corpus/cluster_inspection_v0.md
"""

import sys
import json
import argparse
from pathlib import Path

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def fmt_cluster_row(c, include_rep_fens=True):
    lines = []
    lines.append(f"**{c['clusterId']}**")
    lines.append(f"  size={c['size']}, avgEvalCp={c['avgEvalCp']}, avgLegalMoveCount={c['avgLegalMoveCount']}")
    lines.append(f"  puzzleShare={c['puzzleShare']}, avgDist={c['avgDistanceToCentroid']}, maxDist={c['maxDistanceToCentroid']}")
    pk = c.get("partitionKey", {})
    lines.append(f"  phase={pk.get('phase')} sideToMove={pk.get('sideToMove')} isPuzzle={pk.get('isPuzzle')}")
    lines.append(f"  materialFamily={pk.get('materialFamily')} evalBand={pk.get('evalBand')} source={pk.get('source')}")
    if c.get("topMaterialSignatures"):
        sigs = ", ".join(f"{sig}×{cnt}" for sig, cnt in c["topMaterialSignatures"])
        lines.append(f"  materialSigs: {sigs}")
    else:
        lines.append(f"  materialSigs: _(none recorded)_")
    if include_rep_fens and c.get("representativeFens"):
        lines.append(f"  repFENs: {' | '.join(c['representativeFens'][:3])}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Inspect cluster_summary_v0.json and write markdown report.")
    parser.add_argument("--summary", type=str, default="cache/corpus/cluster_summary_v0.json",
                        help="Input cluster summary JSON")
    parser.add_argument("--output", type=str, default="cache/corpus/cluster_inspection_v0.md",
                        help="Output markdown report")
    parser.add_argument("--top-n", type=int, default=20, help="How many clusters to show per top-N list")
    args = parser.parse_args()

    summary_path = Path(args.summary)
    output_path = Path(args.output)

    if not summary_path.exists():
        sys.stderr.write(f"Error: summary file not found: {summary_path}\n")
        sys.exit(1)

    with open(summary_path, "r", encoding="utf-8") as f:
        summary = json.load(f)

    clusters = summary.get("clusters", [])
    total_positions = summary.get("totalPositions", 0)
    total_partitions = summary.get("totalPartitions", 0)
    total_clusters = summary.get("totalClusters", 0)
    feature_keys = summary.get("featureKeys", [])

    lines = []
    lines.append(f"# Cluster Inspection Report — V0")
    lines.append(f"")
    lines.append(f"_Generated: {summary.get('generatedAt', 'unknown')}_")
    lines.append(f"")
    lines.append(f"## Overview")
    lines.append(f"")
    lines.append(f"| Metric | Value |")
    lines.append(f"| --- | --- |")
    lines.append(f"| Total positions | {total_positions} |")
    lines.append(f"| Total partitions | {total_partitions} |")
    lines.append(f"| Total clusters | {total_clusters} |")
    lines.append(f"| Feature dimensions | {len(feature_keys)} |")
    lines.append(f"")
    lines.append(f"## Top {args.top_n} Largest Clusters")
    lines.append(f"")
    top_size = sorted(clusters, key=lambda c: -c["size"])[:args.top_n]
    lines.append(f"| clusterId | size | avgEvalCp | avgLegalMoveCount | avgDist | materialFamily |")
    lines.append(f"| --- | --- | --- | --- | --- | --- |")
    for c in top_size:
        pk = c.get("partitionKey", {})
        lines.append(f"| {c['clusterId']} | {c['size']} | {c['avgEvalCp']} | {c['avgLegalMoveCount']} | {c['avgDistanceToCentroid']} | {pk.get('materialFamily')} |")
    lines.append(f"")

    lines.append(f"## Top {args.top_n} Highest avgDistanceToCentroid (loosest clusters)")
    lines.append(f"")
    top_avg_dist = sorted(clusters, key=lambda c: -c["avgDistanceToCentroid"])[:args.top_n]
    lines.append(f"| clusterId | size | avgDist | maxDist | avgEvalCp | phase |")
    lines.append(f"| --- | --- | --- | --- | --- | --- |")
    for c in top_avg_dist:
        pk = c.get("partitionKey", {})
        lines.append(f"| {c['clusterId']} | {c['size']} | {c['avgDistanceToCentroid']} | {c['maxDistanceToCentroid']} | {c['avgEvalCp']} | {pk.get('phase')} |")
    lines.append(f"")

    lines.append(f"## Top {args.top_n} Highest maxDistanceToCentroid (most spread)")
    lines.append(f"")
    top_max_dist = sorted(clusters, key=lambda c: -c["maxDistanceToCentroid"])[:args.top_n]
    lines.append(f"| clusterId | size | maxDist | avgDist | avgEvalCp | evalBand |")
    lines.append(f"| --- | --- | --- | --- | --- | --- |")
    for c in top_max_dist:
        pk = c.get("partitionKey", {})
        lines.append(f"| {c['clusterId']} | {c['size']} | {c['maxDistanceToCentroid']} | {c['avgDistanceToCentroid']} | {c['avgEvalCp']} | {pk.get('evalBand')} |")
    lines.append(f"")

    empty_sig = [c for c in clusters if not c.get("topMaterialSignatures")]
    lines.append(f"## Clusters with Empty topMaterialSignatures ({len(empty_sig)} total)")
    lines.append(f"")
    if empty_sig:
        for c in empty_sig[:args.top_n]:
            lines.append(fmt_cluster_row(c) + "\n")
    else:
        lines.append(f"_None — all clusters have at least one material signature._\n")

    tiny = [c for c in clusters if c["size"] <= 3]
    lines.append(f"## Tiny Clusters (size &lt;= 3) ({len(tiny)} total)")
    lines.append(f"")
    if tiny:
        for c in tiny[:args.top_n]:
            lines.append(fmt_cluster_row(c) + "\n")
    else:
        lines.append(f"_None._\n")

    # Distribution by materialFamily
    by_matfam: dict = {}
    for c in clusters:
        mf = c.get("partitionKey", {}).get("materialFamily", "unknown")
        by_matfam.setdefault(mf, []).append(c)

    lines.append(f"## Cluster Distribution by materialFamily")
    lines.append(f"")
    for mf, cs in sorted(by_matfam.items(), key=lambda x: -len(x[1])):
        lines.append(f"### {mf} ({len(cs)} clusters)")
        lines.append(f"")
        lines.append(f"| clusterId | size | avgEvalCp | phase | evalBand |")
        lines.append(f"| --- | --- | --- | --- | --- |")
        for c in sorted(cs, key=lambda x: -x["size"])[:5]:
            pk = c.get("partitionKey", {})
            lines.append(f"| {c['clusterId']} | {c['size']} | {c['avgEvalCp']} | {pk.get('phase')} | {pk.get('evalBand')} |")
        lines.append(f"")

    # Distribution by evalBand
    by_evalband: dict = {}
    for c in clusters:
        eb = c.get("partitionKey", {}).get("evalBand", "unknown")
        by_evalband.setdefault(eb, []).append(c)

    lines.append(f"## Cluster Distribution by evalBand")
    lines.append(f"")
    for eb, cs in sorted(by_evalband.items(), key=lambda x: -len(x[1])):
        lines.append(f"### {eb} ({len(cs)} clusters, total positions: {sum(c['size'] for c in cs)})")
        lines.append(f"")

    # Representative FENs for largest clusters
    lines.append(f"## Representative FENs — Largest Clusters")
    lines.append(f"")
    for c in top_size[:10]:
        lines.append(f"### {c['clusterId']} (size={c['size']})")
        lines.append(f"")
        if c.get("representativeFens"):
            for i, fen in enumerate(c["representativeFens"]):
                lines.append(f"  {i+1}. `{fen}`")
        else:
            lines.append(f"  _(none)_")
        lines.append(f"")

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as outf:
        outf.write("\n".join(lines) + "\n")

    # Also print to stdout
    try:
        print("\n".join(lines))
    except UnicodeEncodeError:
        # Windows console may not support all unicode — write to file only
        pass

    print(f"\nOutput written to: {output_path}")


if __name__ == "__main__":
    main()
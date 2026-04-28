#!/usr/bin/env python3
"""Validate normalized and feature JSONL corpus outputs."""

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path


# Required fields for each kind
REQUIRED_FIELDS = {
    "normalized": [
        "fen",
        "normalizedFen",
        "source",
        "evalCp",
        "mate",
        "bestMove",
        "pv",
        "depth",
        "sideToMove",
        "phase",
        "legalMoveCount",
        "materialSignature",
        "isPuzzle",
    ],
    "features": [
        "fen",
        "normalizedFen",
        "source",
        "hardPartition",
        "features",
        "featureVectorV0",
    ],
}

# Fields to extract for distribution stats (features only)
FEATURES_DIST_FIELDS = ["phase", "source", "materialFamily", "evalBand"]


def check_chess_installed():
    """Check if chess package is installed."""
    try:
        import chess

        return True
    except ImportError:
        return False


def validate_fen(fen: str) -> bool:
    """Validate a FEN string using python-chess."""
    try:
        import chess

        board = chess.Board(fen)
        # Ensure it's a legal position
        return board.is_valid()
    except Exception:
        return False


def load_feature_vector_keys(keys_path: Path) -> list | None:
    """Load feature vector keys if file exists."""
    if keys_path.exists():
        with open(keys_path) as f:
            return json.load(f)
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Validate normalized and feature JSONL corpus outputs."
    )
    parser.add_argument(
        "--input", required=True, help="Path to input JSONL file"
    )
    parser.add_argument(
        "--kind",
        required=True,
        choices=["normalized", "features"],
        help="Kind of corpus: normalized or features",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of rows to process",
    )
    args = parser.parse_args()

    # Check chess installation
    if not check_chess_installed():
        print("Error: 'chess' package not found.")
        print("Install it with: pip install chess")
        sys.exit(1)

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)

    # Try to load feature vector keys
    keys_path = input_path.parent / "feature_vector_v0_keys.json"
    feature_vector_keys = load_feature_vector_keys(keys_path)

    required_fields = REQUIRED_FIELDS[args.kind]

    # Counters
    rows_read = 0
    valid_rows = 0
    malformed_rows = 0
    missing_field_counts = Counter()
    invalid_fen_count = 0
    feature_length_mismatches = 0

    # Distribution counters
    phase_dist = Counter()
    source_dist = Counter()
    material_family_dist = Counter()
    eval_band_dist = Counter()

    with open(input_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            if args.limit is not None and rows_read >= args.limit:
                break

            # Parse JSON defensively
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                malformed_rows += 1
                continue

            rows_read += 1

            # Check for missing required fields
            missing = []
            for field in required_fields:
                if field not in row:
                    missing.append(field)

            if missing:
                for field in missing:
                    missing_field_counts[field] += 1
                continue

            # Validate FEN (fen and normalizedFen)
            if not validate_fen(row["fen"]):
                invalid_fen_count += 1
                continue

            if not validate_fen(row["normalizedFen"]):
                invalid_fen_count += 1
                continue

            # For features kind, validate featureVectorV0
            if args.kind == "features":
                fv = row["featureVectorV0"]
                if not isinstance(fv, list):
                    invalid_fen_count += 1
                    continue

                if not all(isinstance(x, (int, float)) for x in fv):
                    invalid_fen_count += 1
                    continue

                # Check length against keys if available
                if feature_vector_keys is not None:
                    if len(fv) != len(feature_vector_keys):
                        feature_length_mismatches += 1
                        continue

                # Extract hardPartition fields for distribution
                hp = row.get("hardPartition", {})
                if isinstance(hp, dict):
                    phase_dist[hp.get("phase", "unknown")] += 1
                    source_dist[hp.get("source", "unknown")] += 1
                    material_family_dist[hp.get("materialFamily", "unknown")] += 1
                    eval_band_dist[hp.get("evalBand", "unknown")] += 1
            else:
                # For normalized kind, collect phase and source from row
                phase_dist[row.get("phase", "unknown")] += 1
                source_dist[row.get("source", "unknown")] += 1

            valid_rows += 1

    # Print summary
    print(f"=== Validation Summary ({args.kind}) ===")
    print(f"Input: {input_path}")
    print(f"Limit: {args.limit if args.limit else 'none'}")
    print()
    print(f"Rows read:        {rows_read}")
    print(f"Valid rows:       {valid_rows}")
    print(f"Malformed rows:   {malformed_rows}")
    print(f"Invalid FEN:      {invalid_fen_count}")
    if feature_length_mismatches > 0:
        print(f"Feature length mismatches: {feature_length_mismatches}")

    if missing_field_counts:
        print()
        print("Missing field counts:")
        for field, count in sorted(missing_field_counts.items()):
            print(f"  {field}: {count}")

    print()
    print("Phase distribution:")
    for key, count in sorted(phase_dist.items()):
        print(f"  {key}: {count}")

    print()
    print("Source distribution:")
    for key, count in sorted(source_dist.items()):
        print(f"  {key}: {count}")

    if args.kind == "features":
        print()
        print("Material family distribution:")
        for key, count in sorted(material_family_dist.items()):
            print(f"  {key}: {count}")

        print()
        print("Eval band distribution:")
        for key, count in sorted(eval_band_dist.items()):
            print(f"  {key}: {count}")


if __name__ == "__main__":
    main()

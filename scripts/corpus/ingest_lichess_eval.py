#!/usr/bin/env python3
"""
Ingest Lichess eval DB (.jsonl.zst) into a normalized corpus sample.

Usage:
    python scripts/corpus/ingest_lichess_eval.py \\
        --input ~/Downloads/lichess_db_eval.jsonl.zst \\
        --output cache/corpus/lichess_eval_sample.jsonl \\
        --limit 100000

Dependencies:
    pip install zstandard chess
"""

import sys
import json
import argparse
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
try:
    import zstandard as zstd
except ImportError:
    sys.stderr.write(
        "Error: 'zstandard' package not found.\n"
        "Install it with: pip install zstandard chess\n"
    )
    sys.exit(1)

try:
    import chess
except ImportError:
    sys.stderr.write(
        "Error: 'chess' package not found.\n"
        "Install it with: pip install zstandard chess\n"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalize_fen(fen: str) -> str:
    """
    Drop move counters (irrelevant for position identity).
    rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1
    -> rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -
    """
    parts = fen.split()
    return " ".join(parts[:4])


def classify_phase(board: chess.Board) -> str:
    """
    Classify position phase.

    Rules:
    - endgame  : total pieces <= 10  OR  (no queens AND non-pawn material <= 2)
    - opening  : fullmove <= 10  AND  total pieces >= 24
    - middlegame: otherwise
    """
    piece_count = len(board.piece_map())
    total_non_pawn_material = 0
    has_queen = False
    for piece in board.piece_map().values():
        if piece.piece_type != chess.PAWN:
            if piece.piece_type == chess.QUEEN:
                has_queen = True
            total_non_pawn_material += 1

    if piece_count <= 10 or (not has_queen and total_non_pawn_material <= 2):
        return "endgame"
    # Use board.fullmove_number safely; startpos is move 1 -> not opening
    if board.fullmove_number <= 10 and piece_count >= 24:
        return "opening"
    return "middlegame"


def material_signature(board: chess.Board) -> str:
    """
    Encode material imbalance as a compact string.
    e.g. "P8N2B2R2Q1-vs-p8n2b2r2q1"
    Squares are ignored; just counts per piece type for each side.
    White upper-case, black lower-case.
    """
    pieces_w = {}
    pieces_b = {}
    for piece in board.piece_map().values():
        label = piece.symbol().upper()
        if piece.color == chess.WHITE:
            pieces_w[label] = pieces_w.get(label, 0) + 1
        else:
            pieces_b[label] = pieces_b.get(label, 0) + 1

    def sort_key(d):
        order = ["Q", "R", "B", "N", "P"]
        return [order.index(k) if k in order else 99 for k in sorted(d.keys())]

    def fmt(d):
        parts = []
        for label in ["Q", "R", "B", "N", "P"]:
            cnt = d.get(label, 0)
            parts.append(f"{label}{cnt}" if cnt > 0 else f"{label}0")
        return "".join(parts)

    w_str = fmt(dict(sorted(pieces_w.items(), key=lambda x: sort_key({x[0]: x[1]}))))
    b_str = fmt(dict(sorted(pieces_b.items(), key=lambda x: sort_key({x[0]: x[1]}))))
    return f"{w_str}-vs-{b_str}"


def legal_move_count(board: chess.Board) -> int:
    return sum(1 for _ in board.legal_moves)


def extract_best_eval(raw: dict) -> dict | None:
    """
    Extract the best available evaluation from a Lichess eval row.

    Common shapes:
      {"fen": "...", "evals": [{"cp": 34, "mate": null, "depth": 20, "pv": [...]}]}
      {"fen": "...", "cp": 34, "mate": null, "depth": 20, "bestMove": "e2e4", "pv": [...]}
      {"fen": "...", "evals": [{"pvs": [{"cp": 69, "line": "f7g7 e6e2 ..."}]}]}

    Returns a dict with keys: evalCp, mate, depth, bestMove, pv (list of uci)
    or None if no usable eval found.
    """
    fen = raw.get("fen", "")
    evals = raw.get("evals") or raw.get("pvs") or []

    # Direct fields (no wrapping)
    cp = raw.get("cp")
    mate = raw.get("mate")
    depth = raw.get("depth")
    best_move_raw = raw.get("bestMove") or raw.get("bm")
    pv_raw = raw.get("pv") or raw.get("line") or []

    # Normalize cp / mate from direct fields
    if cp is not None or mate is not None:
        return {
            "evalCp": int(cp) if cp is not None else 0,
            "mate": mate,
            "depth": int(depth) if depth else 0,
            "bestMove": best_move_raw if best_move_raw else None,
            "pv": pv_raw if isinstance(pv_raw, list) else [],
        }

    # Iterate evals list to find best (highest depth or best cp)
    best = None
    for e in evals:
        if not isinstance(e, dict):
            continue

        # Shape: {"cp": 34, "depth": 20, "pv": [...]}
        e_cp = e.get("cp")
        e_mate = e.get("mate")
        e_depth = e.get("depth", 0)
        e_bm = e.get("bestMove") or e.get("bm")
        e_pv = e.get("pv") or e.get("line") or []

        if e_cp is not None or e_mate is not None:
            if best is None or int(e_depth) > best["depth"]:
                best = {
                    "evalCp": int(e_cp) if e_cp is not None else 0,
                    "mate": e_mate,
                    "depth": int(e_depth),
                    "bestMove": e_bm,
                    "pv": e_pv if isinstance(e_pv, list) else [],
                }

        # Shape: {"pvs": [{"cp": 69, "line": "f7g7 e6e2 ..."}]}
        pvs = e.get("pvs")
        if pvs and isinstance(pvs, list):
            for pv_entry in pvs:
                if not isinstance(pv_entry, dict):
                    continue
                pv_cp = pv_entry.get("cp")
                pv_mate = pv_entry.get("mate")
                pv_depth = pv_entry.get("depth", 0)
                pv_line = pv_entry.get("line", "")

                # Parse PV line into a list of moves (space-separated uci or san)
                pv_moves = pv_line.split() if isinstance(pv_line, str) else []

                if pv_cp is not None or pv_mate is not None:
                    if best is None or int(pv_depth) > best["depth"]:
                        best = {
                            "evalCp": int(pv_cp) if pv_cp is not None else 0,
                            "mate": pv_mate,
                            "depth": int(pv_depth),
                            "bestMove": pv_moves[0] if pv_moves else None,
                            "pv": pv_moves,
                        }

    return best


def process_row(raw: dict) -> dict | None:
    """
    Convert a raw Lichess eval row into a normalized corpus row.
    Returns None if the row cannot be processed.
    """
    fen = raw.get("fen", "")
    if not fen:
        return None

    try:
        board = chess.Board(fen)
    except ValueError:
        return None

    eval_data = extract_best_eval(raw)
    if eval_data is None:
        return None

    return {
        "fen": fen,
        "normalizedFen": normalize_fen(fen),
        "source": "lichess_eval",
        "evalCp": eval_data["evalCp"],
        "mate": eval_data["mate"],
        "bestMove": eval_data["bestMove"],
        "pv": eval_data["pv"],
        "depth": eval_data["depth"],
        "sideToMove": "white" if board.turn else "black",
        "phase": classify_phase(board),
        "legalMoveCount": legal_move_count(board),
        "materialSignature": material_signature(board),
        "isPuzzle": False,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Ingest Lichess eval DB (.jsonl.zst) into a normalized corpus sample."
    )
    parser.add_argument(
        "--input",
        type=str,
        default=str(Path.home() / "Downloads/lichess_db_eval.jsonl.zst"),
        help="Path to input .zst file (default: ~/Downloads/lichess_db_eval.jsonl.zst). "
             "Use the .part file if download is still in progress.",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="cache/corpus/lichess_eval_sample.jsonl",
        help="Path to output JSONL (default: cache/corpus/lichess_eval_sample.jsonl)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100_000,
        help="Maximum rows to process (default: 100000)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        sys.stderr.write(f"Error: input file not found: {input_path}\n")
        sys.exit(1)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Open .zst stream
    try:
        fh = open(input_path, "rb")
        dctx = zstd.ZstdDecompressor()
        stream = dctx.stream_reader(fh, read_across_frames=True)
        text_stream = stream  # binary stream; decode line by line
    except Exception as exc:
        sys.stderr.write(f"Error opening {input_path}: {exc}\n")
        sys.exit(1)

    out_fh = open(output_path, "w", encoding="utf-8")

    read_rows = 0
    written_rows = 0
    skipped_malformed = 0
    skipped_invalid_fen = 0
    buffer = b""

    try:
        while written_rows < args.limit:
            chunk = text_stream.read(65536)
            if not chunk:
                # Check if we exited the loop due to limit vs actual EOF
                if written_rows < args.limit and buffer.strip():
                    sys.stderr.write(
                        f"Warning: Input appears truncated/incomplete; "
                        f"wrote {written_rows} valid rows before EOF.\n"
                    )
                break
            buffer += chunk

            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                try:
                    decoded = line.decode("utf-8").strip()
                except UnicodeDecodeError:
                    skipped_malformed += 1
                    read_rows += 1
                    continue

                if not decoded:
                    read_rows += 1
                    continue

                read_rows += 1

                try:
                    raw = json.loads(decoded)
                except json.JSONDecodeError:
                    skipped_malformed += 1
                    continue

                row = process_row(raw)
                if row is None:
                    skipped_invalid_fen += 1
                    continue

                out_fh.write(json.dumps(row, ensure_ascii=False) + "\n")
                written_rows += 1

    except (EOFError, zstd.ZstdError) as exc:
        sys.stderr.write(
            f"Warning: Decompression ended early ({exc.__class__.__name__}): "
            f"wrote {written_rows} valid rows before error.\n"
        )
    finally:
        out_fh.close()
        fh.close()

    print(f"Read rows: {read_rows}")
    print(f"Written rows: {written_rows}")
    print(f"Skipped malformed: {skipped_malformed}")
    print(f"Skipped invalid FEN: {skipped_invalid_fen}")
    print(f"Output: {output_path}")


if __name__ == "__main__":
    main()
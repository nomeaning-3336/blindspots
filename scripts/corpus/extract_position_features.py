#!/usr/bin/env python3
"""
V0 position feature extractor for normalized corpus rows.

Read: cache/corpus/lichess_eval_sample.jsonl
Write: cache/corpus/lichess_eval_features.jsonl
Write: cache/corpus/feature_vector_v0_keys.json

Usage:
    python scripts/corpus/extract_position_features.py \\
        --input cache/corpus/lichess_eval_sample.jsonl \\
        --output cache/corpus/lichess_eval_features.jsonl \\
        --limit 0

Dependencies:
    pip install chess

If chess is missing, prints a clear install hint and exits.
"""

import sys
import json
import argparse
from pathlib import Path

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
# Piece values (centipawn approximations)
# ---------------------------------------------------------------------------
PAWN_VALUE = 100
KNIGHT_VALUE = 320
BISHOP_VALUE = 330
ROOK_VALUE = 500
QUEEN_VALUE = 900

PIECE_VALUES = {
    chess.PAWN: PAWN_VALUE,
    chess.KNIGHT: KNIGHT_VALUE,
    chess.BISHOP: BISHOP_VALUE,
    chess.ROOK: ROOK_VALUE,
    chess.QUEEN: QUEEN_VALUE,
}

# ---------------------------------------------------------------------------
# Hard partition keys
# ---------------------------------------------------------------------------
MATERIAL_FAMILIES = [
    "pawn_endgame",
    "rook_endgame",
    "minor_piece_endgame",
    "mixed_endgame",
    "queens_on",
    "queenless",
]
EVAL_BANDS = ["mate", "worse", "equal", "better"]

# ---------------------------------------------------------------------------
# Feature vector keys — deterministic order
# ---------------------------------------------------------------------------
FEATURE_VECTOR_KEYS = [
    # Material counts (10)
    "whitePawns", "blackPawns",
    "whiteKnights", "blackKnights",
    "whiteBishops", "blackBishops",
    "whiteRooks", "blackRooks",
    "whiteQueens", "blackQueens",
    # Material balance (1)
    "materialBalanceCpApprox",
    # King location (4)
    "whiteKingFile", "whiteKingRank",
    "blackKingFile", "blackKingRank",
    # Pawn shield (2)
    "whitePawnShield", "blackPawnShield",
    # Castled-like (2)
    "whiteCastledLike", "blackCastledLike",
    # Pawn structure (6)
    "whitePassedPawns", "blackPassedPawns",
    "whiteIsolatedPawns", "blackIsolatedPawns",
    "whiteDoubledPawns", "blackDoubledPawns",
    # File-based (2)
    "openFiles", "semiOpenFiles",
    # Engine features (6)
    "evalCpClipped", "mateSignedClipped",
    "legalMoveCount", "topMoveGap", "multiPvSpread", "acceptableMoveCount",
    # Best-move flags (3)
    "bestMoveIsCapture", "bestMoveIsCheck", "bestMoveIsPromotion",
    # Puzzle features (6)
    "isPuzzle", "puzzleRatingBucket",
    "puzzleThemeTactical", "puzzleThemeMate",
    "puzzleThemeEndgame", "puzzleThemeOpening",
]
FEATURE_VECTOR_LENGTH = len(FEATURE_VECTOR_KEYS)


# ---------------------------------------------------------------------------
# Helpers: hard partition
# ---------------------------------------------------------------------------

def classify_material_family(board: chess.Board) -> str:
    """
    Classify material family.
    """
    w_queens = sum(1 for p in board.piece_map().values() if p.piece_type == chess.QUEEN and p.color == chess.WHITE)
    b_queens = sum(1 for p in board.piece_map().values() if p.piece_type == chess.QUEEN and p.color == chess.BLACK)
    w_non_pawn = sum(1 for p in board.piece_map().values() if p.piece_type != chess.PAWN and p.color == chess.WHITE)
    b_non_pawn = sum(1 for p in board.piece_map().values() if p.piece_type != chess.PAWN and p.color == chess.BLACK)
    total_pieces = len(board.piece_map())

    if w_non_pawn <= 2 and b_non_pawn <= 2 and total_pieces <= 8:
        return "pawn_endgame"
    if total_pieces <= 10 and w_non_pawn <= 2 and b_non_pawn <= 2:
        return "minor_piece_endgame"
    if w_queens == 0 and b_queens == 0:
        if total_pieces <= 14:
            return "rook_endgame"
        return "mixed_endgame"
    return "queens_on"


def classify_eval_band(eval_cp: int | None, mate: int | None) -> str:
    if mate is not None:
        return "mate"
    if eval_cp is None:
        return "equal"
    if eval_cp <= -300:
        return "worse"
    if eval_cp >= 300:
        return "better"
    return "equal"


# ---------------------------------------------------------------------------
# Helpers: features
# ---------------------------------------------------------------------------

def count_pieces_by_color_and_type(board: chess.Board):
    """Return dict: whitePawns, blackPawns, whiteKnights, ... whiteQueens, blackQueens."""
    counts = {f"whitePawns": 0, "blackPawns": 0,
              "whiteKnights": 0, "blackKnights": 0,
              "whiteBishops": 0, "blackBishops": 0,
              "whiteRooks": 0, "blackRooks": 0,
              "whiteQueens": 0, "blackQueens": 0}
    piece_map = board.piece_map()
    for piece in piece_map.values():
        color_label = "white" if piece.color == chess.WHITE else "black"
        pt_label = {chess.PAWN: "Pawns", chess.KNIGHT: "Knights", chess.BISHOP: "Bishops",
                    chess.ROOK: "Rooks", chess.QUEEN: "Queens"}.get(piece.piece_type, "")
        if pt_label:
            counts[f"{color_label}{pt_label}"] += 1
    return counts


def material_balance_cp(board: chess.Board) -> int:
    """White-perspective material balance in cp."""
    white_sum = sum(PIECE_VALUES.get(p.piece_type, 0) for p in board.piece_map().values() if p.color == chess.WHITE)
    black_sum = sum(PIECE_VALUES.get(p.piece_type, 0) for p in board.piece_map().values() if p.color == chess.BLACK)
    return white_sum - black_sum


def king_location(board: chess.Board):
    """Return (whiteKingFile, whiteKingRank, blackKingFile, blackKingRank) — all 0-7 or 0."""
    wk = board.king(chess.WHITE)
    bk = board.king(chess.BLACK)
    return (
        chess.square_file(wk),
        chess.square_rank(wk),
        chess.square_file(bk),
        chess.square_rank(bk),
    )


def is_castled_like(board: chess.Board, color: chess.Color) -> int:
    """Return 1 if king is on g-file (file 6) or c-file (file 2), else 0."""
    king_sq = board.king(color)
    f = chess.square_file(king_sq)
    return 1 if f in (2, 6) else 0


def pawn_shield(board: chess.Board, color: chess.Color) -> int:
    """
    Count friendly pawns on adjacent files one rank directly in front of king.
    For white: king's rank + 1 (toward black side); for black: king's rank - 1 (toward white side).
    """
    king_sq = board.king(color)
    kf = chess.square_file(king_sq)
    kr = chess.square_rank(king_sq)
    if color == chess.WHITE:
        shield_rank = kr + 1
    else:
        shield_rank = kr - 1
    if shield_rank < 0 or shield_rank > 7:
        return 0
    count = 0
    for df in (-1, 0, 1):
        sf = kf + df
        if 0 <= sf <= 7:
            sq = chess.square(sf, shield_rank)
            piece = board.piece_at(sq)
            if piece and piece.piece_type == chess.PAWN and piece.color == color:
                count += 1
    return count


def passed_pawns(board: chess.Board, color: chess.Color) -> int:
    """Count passed pawns for the given color."""
    if color == chess.WHITE:
        forward = 1
        home_rank = 1
        promotion_rank = 7
    else:
        forward = -1
        home_rank = 6
        promotion_rank = 0
    passed = 0
    enemy_color = chess.BLACK if color == chess.WHITE else chess.WHITE
    for square, piece in board.piece_map().items():
        if piece.piece_type != chess.PAWN or piece.color != color:
            continue
        f = chess.square_file(square)
        r = chess.square_rank(square)
        # A pawn is passed if no enemy pawns exist on the same file ahead,
        # or on the adjacent files ahead (same direction toward promotion).
        is_passed = True
        for df in (-1, 0, 1):
            check_file = f + df
            if not (0 <= check_file <= 7):
                continue
            for check_r in range(r + forward, promotion_rank + forward, forward):
                if not (0 <= check_r <= 7):
                    break
                sq_check = chess.square(check_file, check_r)
                p = board.piece_at(sq_check)
                if p and p.piece_type == chess.PAWN and p.color == enemy_color:
                    is_passed = False
                    break
            if not is_passed:
                break
        if is_passed:
            passed += 1
    return passed


def isolated_pawns(board: chess.Board, color: chess.Color) -> int:
    """Count isolated pawns (no friendly pawns on adjacent files at any rank)."""
    pawn_squares = [sq for sq, p in board.piece_map().items()
                    if p.piece_type == chess.PAWN and p.color == color]
    isolated = 0
    for sq in pawn_squares:
        f = chess.square_file(sq)
        # Check adjacent files (left and right) at any rank for a friendly pawn
        has_friendly_neighbor = False
        for df in (-1, 1):
            adj_file = f + df
            if not (0 <= adj_file <= 7):
                continue
            for rank in range(8):
                adj_sq = chess.square(adj_file, rank)
                p = board.piece_at(adj_sq)
                if p and p.piece_type == chess.PAWN and p.color == color:
                    has_friendly_neighbor = True
                    break
            if has_friendly_neighbor:
                break
        if not has_friendly_neighbor:
            isolated += 1
    return isolated


def doubled_pawns(board: chess.Board, color: chess.Color) -> int:
    """Count pawns that have another friendly pawn somewhere ahead on the same file."""
    pawns_by_file = {}
    for sq, piece in board.piece_map().items():
        if piece.piece_type == chess.PAWN and piece.color == color:
            f = chess.square_file(sq)
            pawns_by_file.setdefault(f, []).append(sq)
    doubled = 0
    for f, squares in pawns_by_file.items():
        if len(squares) > 1:
            doubled += len(squares)
    return doubled


def open_and_semiopen_files(board: chess.Board):
    """
    Return (open_count, semi_open_count).
    Open = no pawns on either side.
    Semi-open = pawns for exactly one side.
    """
    white_pawn_files = set()
    black_pawn_files = set()
    for sq, piece in board.piece_map().items():
        if piece.piece_type == chess.PAWN:
            f = chess.square_file(sq)
            if piece.color == chess.WHITE:
                white_pawn_files.add(f)
            else:
                black_pawn_files.add(f)
    open_files = 0
    semi_open = 0
    for f in range(8):
        if f not in white_pawn_files and f not in black_pawn_files:
            open_files += 1
        elif f in white_pawn_files and f not in black_pawn_files:
            semi_open += 1
        elif f not in white_pawn_files and f in black_pawn_files:
            semi_open += 1
    return open_files, semi_open


def apply_move(board: chess.Board, uci: str):
    """Try to apply a UCI move string; return move or None."""
    if not uci or len(uci) < 4:
        return None
    try:
        from_sq = chess.Square(int(uci[0:2], 26))  # will fail
    except Exception:
        pass
    try:
        move = chess.Move.from_uci(uci)
        if move in board.legal_moves:
            return move
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Puzzle theme grouping
# ---------------------------------------------------------------------------

TACTICAL_THEMES = {"fork", "pin", "skewer", "discoveredAttack", "attraction",
                   "deflection", "interference", "clearance", "trappedPiece"}
MATE_THEMES = {"mate", "mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5"}
ENDGAME_THEMES = {"pawnEndgame", "rookEndgame", "bishopEndgame", "knightEndgame", "queenEndgame"}
OPENING_THEMES = {"opening", "advancedPawn"}


def puzzle_theme_groups(themes: list | None) -> dict:
    """Return tactical/mate/endgame/opening booleans from theme list."""
    if not themes:
        return {"puzzleThemeTactical": 0, "puzzleThemeMate": 0,
                "puzzleThemeEndgame": 0, "puzzleThemeOpening": 0}
    theme_set = set(str(t).lower() for t in themes)
    return {
        "puzzleThemeTactical": 1 if theme_set & TACTICAL_THEMES else 0,
        "puzzleThemeMate": 1 if theme_set & MATE_THEMES else 0,
        "puzzleThemeEndgame": 1 if theme_set & ENDGAME_THEMES else 0,
        "puzzleThemeOpening": 1 if theme_set & OPENING_THEMES else 0,
    }


# ---------------------------------------------------------------------------
# Best-move flags
# ---------------------------------------------------------------------------

def best_move_flags(board: chess.Board, best_move_uci: str | None) -> dict:
    """Return isCapture, isCheck, isPromotion for the best move."""
    result = {"bestMoveIsCapture": 0, "bestMoveIsCheck": 0, "bestMoveIsPromotion": 0}
    if not best_move_uci:
        return result
    try:
        move = chess.Move.from_uci(best_move_uci)
    except Exception:
        return result
    if move not in board.legal_moves:
        return result
    result["bestMoveIsCapture"] = 1 if board.is_capture(move) else 0
    board.push(move)
    result["bestMoveIsCheck"] = 1 if board.is_check() else 0
    board.pop()
    # Check promotion
    if len(best_move_uci) >= 5 and best_move_uci[4] in ("q", "r", "b", "n"):
        result["bestMoveIsPromotion"] = 1
    return result


# ---------------------------------------------------------------------------
# Extract all features from a normalized row
# ---------------------------------------------------------------------------

def extract_features(row: dict) -> dict | None:
    """
    Compute hardPartition, features, and featureVectorV0 from a normalized row.
    Returns None if FEN is invalid.
    """
    fen = row.get("fen", "")
    if not fen:
        return None
    try:
        board = chess.Board(fen)
    except Exception:
        return None

    side_to_move = "white" if board.turn else "black"
    phase = row.get("phase", "middlegame")
    is_puzzle = bool(row.get("isPuzzle", False))

    # --- Hard partition ---
    hard_partition = {
        "phase": phase,
        "sideToMove": side_to_move,
        "source": row.get("source", "lichess_eval"),
        "isPuzzle": is_puzzle,
        "materialFamily": classify_material_family(board),
        "evalBand": classify_eval_band(row.get("evalCp"), row.get("mate")),
    }

    # --- Piece counts ---
    piece_counts = count_pieces_by_color_and_type(board)

    # --- Material balance ---
    balance_cp = material_balance_cp(board)

    # --- King location ---
    wk_file, wk_rank, bk_file, bk_rank = king_location(board)

    # --- Pawn shield ---
    white_shield = pawn_shield(board, chess.WHITE)
    black_shield = pawn_shield(board, chess.BLACK)

    # --- Castled-like ---
    white_castled = is_castled_like(board, chess.WHITE)
    black_castled = is_castled_like(board, chess.BLACK)

    # --- Pawn structure ---
    white_passed = passed_pawns(board, chess.WHITE)
    black_passed = passed_pawns(board, chess.BLACK)
    white_isolated = isolated_pawns(board, chess.WHITE)
    black_isolated = isolated_pawns(board, chess.BLACK)
    white_doubled = doubled_pawns(board, chess.WHITE)
    black_doubled = doubled_pawns(board, chess.BLACK)

    # --- Open/semi-open files ---
    open_files, semi_open = open_and_semiopen_files(board)

    # --- Engine features ---
    eval_cp_raw = row.get("evalCp", 0) or 0
    mate_raw = row.get("mate")
    eval_cp_clipped = max(-2000, min(2000, eval_cp_raw))
    mate_signed = mate_raw if mate_raw is not None else 0
    mate_clipped = max(-10, min(10, mate_signed))
    legal_moves = row.get("legalMoveCount", 0) or 0

    # Multi-PV / topMoveGap: compute from PV if multiple lines exist
    pv = row.get("pv") or []
    top_move_gap = 0
    multi_pv_spread = 0
    acceptable_move_count = 0

    # bestMove flags
    bm_flags = best_move_flags(board, row.get("bestMove"))

    # Puzzle theme groups
    puzzle_themes = row.get("puzzleThemes") or row.get("tags") or None
    theme_groups = puzzle_theme_groups(puzzle_themes)

    # Puzzle rating bucket
    puzzle_rating = row.get("puzzleRating") or row.get("puzzle_rating") or 0
    puzzle_rating_bucket = int(puzzle_rating) // 200  # bucket every 200

    # --- Assemble features dict ---
    features = {
        **piece_counts,
        "materialBalanceCpApprox": balance_cp,
        "whiteKingFile": wk_file,
        "whiteKingRank": wk_rank,
        "blackKingFile": bk_file,
        "blackKingRank": bk_rank,
        "whitePawnShield": white_shield,
        "blackPawnShield": black_shield,
        "whiteCastledLike": white_castled,
        "blackCastledLike": black_castled,
        "whitePassedPawns": white_passed,
        "blackPassedPawns": black_passed,
        "whiteIsolatedPawns": white_isolated,
        "blackIsolatedPawns": black_isolated,
        "whiteDoubledPawns": white_doubled,
        "blackDoubledPawns": black_doubled,
        "openFiles": open_files,
        "semiOpenFiles": semi_open,
        "evalCpClipped": eval_cp_clipped,
        "mateSignedClipped": mate_clipped,
        "legalMoveCount": legal_moves,
        "topMoveGap": top_move_gap,
        "multiPvSpread": multi_pv_spread,
        "acceptableMoveCount": acceptable_move_count,
        **bm_flags,
        "isPuzzle": 1 if is_puzzle else 0,
        "puzzleRatingBucket": puzzle_rating_bucket,
        **theme_groups,
    }

    # --- Build feature vector V0 ---
    try:
        feature_vector = [features[k] for k in FEATURE_VECTOR_KEYS]
    except KeyError as e:
        sys.stderr.write(f"Warning: missing feature key {e} for FEN {fen[:50]}\n")
        return None

    return {
        "fen": fen,
        "normalizedFen": row.get("normalizedFen", fen),
        "source": row.get("source", "lichess_eval"),
        "clusterId": None,
        "materialSignature": row.get("materialSignature") or features.get("materialSignature"),
        "hardPartition": hard_partition,
        "features": features,
        "featureVectorV0": feature_vector,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="V0 position feature extractor for normalized corpus rows."
    )
    parser.add_argument(
        "--input",
        type=str,
        default="cache/corpus/lichess_eval_sample.jsonl",
        help="Input normalized JSONL (default: cache/corpus/lichess_eval_sample.jsonl)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="cache/corpus/lichess_eval_features.jsonl",
        help="Output feature-enriched JSONL (default: cache/corpus/lichess_eval_features.jsonl)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max rows to process; 0 means no limit (default: 0)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    keys_path = Path("cache/corpus/feature_vector_v0_keys.json")

    if not input_path.exists():
        sys.stderr.write(f"Error: input file not found: {input_path}\n")
        sys.exit(1)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Write feature vector keys once
    with open(keys_path, "w", encoding="utf-8") as kf:
        json.dump(FEATURE_VECTOR_KEYS, kf, ensure_ascii=False)

    read_rows = 0
    written_rows = 0
    skipped_malformed = 0
    skipped_invalid_fen = 0

    with open(input_path, "r", encoding="utf-8") as inf:
        with open(output_path, "w", encoding="utf-8") as outf:
            for line in inf:
                if args.limit > 0 and written_rows >= args.limit:
                    break
                read_rows += 1
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    skipped_malformed += 1
                    continue
                result = extract_features(row)
                if result is None:
                    skipped_invalid_fen += 1
                    continue
                outf.write(json.dumps(result, ensure_ascii=False) + "\n")
                written_rows += 1

    print(f"Read rows: {read_rows}")
    print(f"Written rows: {written_rows}")
    print(f"Skipped malformed: {skipped_malformed}")
    print(f"Skipped invalid FEN: {skipped_invalid_fen}")
    print(f"Output: {output_path}")
    print(f"Feature keys: {keys_path}")


if __name__ == "__main__":
    main()
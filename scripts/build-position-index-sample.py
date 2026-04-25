#!/usr/bin/env python3
"""Extract an inspectable NDJSON sample of positions from Lichess Elite PGNs."""

from __future__ import annotations

import argparse
import io
import json
import random
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import chess.pgn


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ZIP = REPO_ROOT / "maia2-skill-adaptation" / "lichess_elite_2020-08.zip"
DEFAULT_OUTPUT = REPO_ROOT / "data" / "position-index" / "positions-10k.ndjson"


def main() -> int:
    args = parse_args()
    started = time.monotonic()
    output = args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat()
    source = args.pgn_path or args.pgn_zip
    written = 0
    games_read = 0
    rng = random.Random(args.seed)

    with output.open("w", encoding="utf-8", newline="\n") as handle:
        for game_index, game in enumerate(read_games(args), start=1):
            if args.max_games > 0 and game_index > args.max_games:
                break
            games_read = game_index
            for position in sample_positions(game, game_index, args.positions_per_game, args.min_ply, args.max_ply, rng):
                written += 1
                position["position_id"] = f"elite2020-08-{written:08d}"
                position["source_pgn"] = str(source)
                position["created_at"] = timestamp
                handle.write(json.dumps(position, separators=(",", ":")) + "\n")
                if args.limit > 0 and written >= args.limit:
                    break
            if args.limit > 0 and written >= args.limit:
                break

    if args.limit > 0 and written != args.limit:
        raise RuntimeError(f"Only wrote {written} positions; requested {args.limit}.")

    elapsed = time.monotonic() - started
    print(json.dumps({
        "ok": True,
        "output": str(output),
        "positions": written,
        "games_read": games_read,
        "limit": args.limit,
        "max_games": args.max_games,
        "elapsed_seconds": round(elapsed, 3),
    }, indent=2), flush=True)
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a prototype position NDJSON sample.")
    parser.add_argument("--pgn-zip", type=Path, default=DEFAULT_ZIP)
    parser.add_argument("--pgn-path", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=10_000, help="0 means no limit; walk all games.")
    parser.add_argument("--positions-per-game", type=int, default=5)
    parser.add_argument("--max-games", type=int, default=0, help="0 means no game cap.")
    parser.add_argument("--min-ply", type=int, default=10)
    parser.add_argument("--max-ply", type=int, default=0, help="0 means no maximum.")
    parser.add_argument("--seed", type=int, default=20260424)
    args = parser.parse_args()
    if args.limit < 0:
        raise ValueError("--limit must be >= 0")
    if args.positions_per_game < 1:
        raise ValueError("--positions-per-game must be >= 1")
    if args.max_games < 0:
        raise ValueError("--max-games must be >= 0")
    if args.min_ply < 1:
        raise ValueError("--min-ply must be >= 1")
    args.pgn_zip = resolve_path(args.pgn_zip)
    if args.pgn_path is not None:
        args.pgn_path = resolve_path(args.pgn_path)
        if not args.pgn_path.exists():
            raise FileNotFoundError(f"PGN path not found: {args.pgn_path}")
    elif not args.pgn_zip.exists():
        raise FileNotFoundError(f"PGN zip not found: {args.pgn_zip}")
    if not args.output.is_absolute():
        args.output = REPO_ROOT / args.output
    return args


def resolve_path(path: Path) -> Path:
    if path.is_absolute():
        return path
    candidates = [
        Path.cwd() / path,
        REPO_ROOT / path,
        REPO_ROOT / "maia2-skill-adaptation" / path.name,
    ]
    return next((candidate for candidate in candidates if candidate.exists()), candidates[0])


def read_games(args: argparse.Namespace) -> Iterable[chess.pgn.Game]:
    if args.pgn_path is not None:
        with args.pgn_path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
            while True:
                game = chess.pgn.read_game(handle)
                if game is None:
                    break
                yield game
        return

    with zipfile.ZipFile(args.pgn_zip) as archive:
        members = [member for member in archive.infolist() if member.filename.lower().endswith(".pgn")]
        if not members:
            raise RuntimeError(f"No .pgn member found inside {args.pgn_zip}")
        with archive.open(members[0], "r") as raw:
            text = io.TextIOWrapper(raw, encoding="utf-8", errors="replace", newline="")
            while True:
                game = chess.pgn.read_game(text)
                if game is None:
                    break
                yield game


def sample_positions(
    game: chess.pgn.Game,
    game_index: int,
    positions_per_game: int,
    min_ply: int,
    max_ply: int,
    rng: random.Random,
) -> list[dict[str, object]]:
    moves = list(game.mainline_moves())
    if not moves:
        return []
    upper = len(moves) if max_ply <= 0 else min(max_ply, len(moves))
    eligible = list(range(max(1, min_ply), upper + 1))
    if not eligible:
        return []
    sampled = sorted(rng.sample(eligible, min(positions_per_game, len(eligible))))
    sampled_set = set(sampled)
    board = game.board()
    rows: list[dict[str, object]] = []
    for ply, move in enumerate(moves, start=1):
        board.push(move)
        if ply in sampled_set:
            rows.append({
                "game_index": game_index,
                "ply": ply,
                "fen": board.fen(),
                "white": str(game.headers.get("White", "")),
                "black": str(game.headers.get("Black", "")),
                "event": str(game.headers.get("Event", "")),
                "site": str(game.headers.get("Site", "")),
                "result": str(game.headers.get("Result", "")),
            })
    return rows


if __name__ == "__main__":
    raise SystemExit(main())

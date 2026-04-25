#!/usr/bin/env python3
"""Stream random positions from a zipped Lichess Elite PGN and keep similarity bests.

The scoring is delegated to scripts/fen-similarity-worker.ts so this uses the
same deterministic consequence fingerprint as the TypeScript baseline.
"""

from __future__ import annotations

import argparse
import csv
import heapq
import importlib.util
import io
import json
import math
import os
import random
import subprocess
import sys
import time
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import chess
import chess.pgn

try:
    from colorama import just_fix_windows_console
    from termcolor import colored

    just_fix_windows_console()
except Exception:
    def colored(text: object, *args: object, **kwargs: object) -> str:
        return str(text)


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKER_SCRIPT = REPO_ROOT / "scripts" / "fen-similarity-worker.ts"
STOCKFISH_RERANK_SCRIPT = REPO_ROOT / "scripts" / "stockfish-10ms-rerank.py"
DEFAULT_ENGINE = (
    REPO_ROOT / "stockfish-windows-x86-64-avx2.exe"
    if (REPO_ROOT / "stockfish-windows-x86-64-avx2.exe").exists()
    else REPO_ROOT / "stockfish.js"
)
DEFAULT_ZIP = REPO_ROOT / "maia2-skill-adaptation" / "lichess_elite_2020-08.zip"
DEFAULT_CHECKPOINTS = [10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000]


@dataclass(order=True)
class ScoredPosition:
    score: float
    counter: int
    structural_score: float = field(compare=False)
    final_score: float = field(compare=False)
    fen: str = field(compare=False)
    game_index: int = field(compare=False)
    ply: int = field(compare=False)
    white: str = field(compare=False)
    black: str = field(compare=False)
    event: str = field(compare=False)
    site: str = field(compare=False)
    breakdown: dict[str, float] = field(compare=False)
    eval_cp: float | None = field(compare=False)
    norm_eval: float | None = field(compare=False)
    eval_delta: float | None = field(compare=False)
    phase_profile: dict[str, object] = field(compare=False)
    engine_intent_score: float | None = field(default=None, compare=False)
    engine_result_score: float | None = field(default=None, compare=False)
    engine_eval_compat_score: float | None = field(default=None, compare=False)
    engine_bestmove: str | None = field(default=None, compare=False)
    engine_eval_cp: float | None = field(default=None, compare=False)
    engine_eval_white_cp: float | None = field(default=None, compare=False)
    engine_mate: float | None = field(default=None, compare=False)
    engine_mate_white: float | None = field(default=None, compare=False)
    engine_gap_cp: float | None = field(default=None, compare=False)


@dataclass
class EvalIndex:
    path: Path
    values_by_key: dict[str, float]

    def get(self, fen: str) -> float | None:
        board = chess.Board(fen)
        for key in fen_keys(board):
            if key in self.values_by_key:
                return self.values_by_key[key]
        return None


class SimilarityWorker:
    def __init__(self, query_fen: str) -> None:
        env = os.environ.copy()
        env["NODE_NO_WARNINGS"] = "1"
        self.process = subprocess.Popen(
            [
                "node",
                "--experimental-strip-types",
                str(WORKER_SCRIPT),
                "--query-fen",
                query_fen,
            ],
            cwd=REPO_ROOT,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )

    def request(self, payload: dict[str, object]) -> dict[str, object]:
        if not self.process.stdin or not self.process.stdout:
            raise RuntimeError("Similarity worker pipes were not opened.")
        if self.process.poll() is not None:
            stderr = self.process.stderr.read() if self.process.stderr else ""
            raise RuntimeError(f"Similarity worker exited early: {stderr}")

        self.process.stdin.write(json.dumps(payload) + "\n")
        self.process.stdin.flush()
        raw = self.process.stdout.readline()
        if not raw:
            stderr = self.process.stderr.read() if self.process.stderr else ""
            raise RuntimeError(f"Similarity worker produced no response: {stderr}")

        payload = json.loads(raw)
        if not payload.get("ok"):
            raise RuntimeError(str(payload.get("error", "Unknown scorer error")))
        return payload

    def score(self, fen: str) -> dict[str, object]:
        return self.request({"fen": fen})

    def query_phase_profile(self) -> dict[str, object]:
        payload = self.request({"queryProfile": True})
        profile = payload.get("phaseProfile")
        if not isinstance(profile, dict):
            raise RuntimeError("Similarity worker did not return a query phase profile.")
        return profile

    def close(self) -> None:
        if self.process.stdin:
            self.process.stdin.close()
        try:
            self.process.terminate()
            self.process.wait(timeout=2)
        except Exception:
            self.process.kill()


def main() -> int:
    args = parse_args()
    rng = random.Random(args.seed)
    checkpoints = parse_checkpoints(args.checkpoints)
    eval_index = load_eval_index(args.eval_sidecar)
    query_norm_eval = (
        normalize_eval_cp(args.eval_cp, chess.Board(args.fen), args.eval_perspective)
        if args.eval_cp is not None
        else None
    )
    next_checkpoint_index = 0
    top_heap: list[ScoredPosition] = []
    scored_count = 0
    eval_rejected_count = 0
    eval_missing_count = 0
    phase_rejected_count = 0
    compatibility_rejected_count = 0
    game_count = 0
    start_time = time.monotonic()
    last_checkpoint_elapsed = 0.0
    worker = SimilarityWorker(args.fen)
    query_phase_profile = worker.query_phase_profile()
    internal_keep = max(args.keep, args.engine_rerank_top if args.engine_rerank else args.keep)
    auto_min_ply = int(query_phase_profile.get("suggestedMinPly", 0))
    effective_min_ply = (
        args.min_ply
        if args.min_ply is not None
        else auto_min_ply
        if args.auto_min_ply
        else 0
    )

    print(bold("FEN Similarity Random Search"), flush=True)
    print(f"{muted('Query FEN')} {chess.Board(args.fen).fen()}", flush=True)
    print(f"{muted('PGN zip')}   {args.pgn_zip}", flush=True)
    print(
        f"{muted('Sampling')}  positions_per_game={accent(args.positions_per_game)}, min_ply={accent(effective_min_ply)}, "
        f"max_ply={accent(args.max_ply or 'none')}, max_games={accent(args.max_games or 'none')}",
        flush=True,
    )
    print(
        f"{muted('Phase')}     {phase_summary(query_phase_profile)}, auto_min_ply={accent(auto_min_ply)}, "
        f"override_min_ply={accent(args.min_ply if args.min_ply is not None else 'none')}",
        flush=True,
    )
    print(
        f"{muted('Filters')}   phase_filter={accent(args.phase_filter)}, max_phase_delta={accent(args.max_phase_delta)}, "
        f"compatibility_filter={accent(args.compatibility_filter)}",
        flush=True,
    )
    print(
        f"{muted('Eval')}      perspective={accent(args.eval_perspective)}, query_cp={accent(args.eval_cp if args.eval_cp is not None else 'none')}, "
        f"query_norm={accent(format_optional(query_norm_eval))}, max_delta={accent(args.max_eval_delta)}",
        flush=True,
    )
    print(
        f"{muted('Eval data')} {eval_index.path if eval_index else 'none; running without candidate eval filtering'}",
        flush=True,
    )
    if args.engine_rerank:
        print(
            f"{muted('Engine')}    rerank_top={accent(args.engine_rerank_top)}, movetime_ms={accent(args.engine_movetime_ms)}, "
            f"multipv={accent(args.engine_multipv)}, engine={accent(args.engine_path)}",
            flush=True,
        )
    print(muted("Press Ctrl+C to stop and print the current top 5."), flush=True)
    print("", flush=True)

    try:
        for game_index, game in enumerate(read_games(args.pgn_zip), start=1):
            game_count = game_index
            sampled = sample_positions_from_game(
                game=game,
                game_index=game_index,
                positions_per_game=args.positions_per_game,
                min_ply=effective_min_ply,
                max_ply=args.max_ply,
                rng=rng,
            )
            for candidate in sampled:
                if args.time_limit_seconds and time.monotonic() - start_time >= args.time_limit_seconds:
                    raise StopIteration
                candidate_fen = str(candidate["fen"])
                scored = worker.score(candidate_fen)
                scored_count += 1
                candidate_phase_profile = scored.get("phaseProfile")
                if not isinstance(candidate_phase_profile, dict):
                    raise RuntimeError("Similarity worker did not return a candidate phase profile.")

                phase_delta = abs(
                    float(query_phase_profile.get("phaseScore", 0.0))
                    - float(candidate_phase_profile.get("phaseScore", 0.0))
                )
                if args.phase_filter and phase_delta > args.max_phase_delta:
                    phase_rejected_count += 1
                    continue
                if args.compatibility_filter and not phase_profiles_compatible(
                    query_phase_profile, candidate_phase_profile
                ):
                    compatibility_rejected_count += 1
                    continue

                candidate_eval_cp = eval_index.get(candidate_fen) if eval_index else None
                candidate_norm_eval = (
                    normalize_eval_cp(candidate_eval_cp, chess.Board(candidate_fen), args.eval_perspective)
                    if candidate_eval_cp is not None
                    else None
                )
                eval_delta = (
                    abs(query_norm_eval - candidate_norm_eval)
                    if query_norm_eval is not None and candidate_norm_eval is not None
                    else None
                )
                if query_norm_eval is not None and candidate_norm_eval is None:
                    eval_missing_count += 1
                if eval_delta is not None and eval_delta > args.max_eval_delta:
                    eval_rejected_count += 1
                    continue

                structural_score = float(scored["score"])
                final_score = structural_score
                push_top(
                    top_heap,
                    ScoredPosition(
                        score=final_score,
                        counter=scored_count,
                        structural_score=structural_score,
                        final_score=final_score,
                        fen=candidate_fen,
                        game_index=game_index,
                        ply=int(candidate["ply"]),
                        white=str(game.headers.get("White", "")),
                        black=str(game.headers.get("Black", "")),
                        event=str(game.headers.get("Event", "")),
                        site=str(game.headers.get("Site", "")),
                        breakdown={
                            "token": float(scored["tokenScore"]),
                            "pressure": float(scored["pressureScore"]),
                            "scalar": float(scored["scalarScore"]),
                            "mobility": float(scored["mobilityScore"]),
                            "material": float(scored["materialScore"]),
                        },
                        eval_cp=candidate_eval_cp,
                        norm_eval=candidate_norm_eval,
                        eval_delta=eval_delta,
                        phase_profile=candidate_phase_profile,
                    ),
                    keep=internal_keep,
                )

                while (
                    next_checkpoint_index < len(checkpoints)
                    and scored_count >= checkpoints[next_checkpoint_index]
                ):
                    elapsed = time.monotonic() - start_time
                    print_checkpoint(
                        label=f"checkpoint {checkpoints[next_checkpoint_index]:,}",
                        top_heap=top_for_display(top_heap, args.keep),
                        scored_count=scored_count,
                        game_count=game_count,
                        elapsed=elapsed,
                        since_last=elapsed - last_checkpoint_elapsed,
                        eval_rejected_count=eval_rejected_count,
                        eval_missing_count=eval_missing_count,
                        eval_enabled=query_norm_eval is not None,
                        phase_rejected_count=phase_rejected_count,
                        compatibility_rejected_count=compatibility_rejected_count,
                        phase_filter_enabled=args.phase_filter,
                        compatibility_filter_enabled=args.compatibility_filter,
                    )
                    last_checkpoint_elapsed = elapsed
                    next_checkpoint_index += 1

                if args.max_positions and scored_count >= args.max_positions:
                    raise StopIteration

            if args.max_games and game_count >= args.max_games:
                break
    except KeyboardInterrupt:
        print(f"\n{warn('Ctrl+C received; stopping cleanly.')}", flush=True)
    except StopIteration:
        print(f"\n{warn('Reached requested max positions.')}", flush=True)
    finally:
        pass

    if args.engine_rerank and top_heap:
        top_heap = rerank_with_engine(args, args.fen, top_heap, worker)

    elapsed = time.monotonic() - start_time
    print(f"\n{bold('Input FEN')} {accent(chess.Board(args.fen).fen())}", flush=True)
    print_checkpoint(
        label="final",
        top_heap=top_for_display(top_heap, args.keep),
        scored_count=scored_count,
        game_count=game_count,
        elapsed=elapsed,
        since_last=elapsed - last_checkpoint_elapsed,
        eval_rejected_count=eval_rejected_count,
        eval_missing_count=eval_missing_count,
        eval_enabled=query_norm_eval is not None,
        phase_rejected_count=phase_rejected_count,
        compatibility_rejected_count=compatibility_rejected_count,
        phase_filter_enabled=args.phase_filter,
        compatibility_filter_enabled=args.compatibility_filter,
    )
    worker.close()
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Randomly sample positions from Lichess Elite 2020-08 and keep highest deterministic FEN similarity scores."
    )
    parser.add_argument("--fen", required=True, help="Query FEN.")
    parser.add_argument("--pgn-zip", type=Path, default=DEFAULT_ZIP)
    parser.add_argument("--positions-per-game", type=int, default=4)
    parser.add_argument("--min-ply", type=int, default=None, help="Override automatic query phase min ply.")
    parser.add_argument("--auto-min-ply", dest="auto_min_ply", action="store_true", default=True)
    parser.add_argument("--no-auto-min-ply", dest="auto_min_ply", action="store_false")
    parser.add_argument("--max-ply", type=int, default=0, help="0 means no maximum.")
    parser.add_argument("--seed", type=int, default=20260424)
    parser.add_argument("--checkpoints", default=",".join(str(value) for value in DEFAULT_CHECKPOINTS))
    parser.add_argument("--keep", type=int, default=5, help="How many best examples to print.")
    parser.add_argument("--max-games", type=int, default=0, help="Optional test limit.")
    parser.add_argument("--max-positions", type=int, default=0, help="Optional test limit.")
    parser.add_argument("--time-limit-seconds", type=float, default=0, help="Optional wall-clock test limit. 0 means no limit.")
    parser.add_argument("--engine-rerank", action="store_true", help="Rerank the current shortlist with a tiny Stockfish pass after scanning.")
    parser.add_argument("--engine-rerank-top", type=int, default=100, help="How many structural candidates to rerank with Stockfish.")
    parser.add_argument("--engine-movetime-ms", type=int, default=10, help="Stockfish movetime per position for reranking.")
    parser.add_argument("--engine-multipv", type=int, default=3, help="Requested Stockfish MultiPV for reranking diagnostics.")
    parser.add_argument("--engine-path", type=Path, default=DEFAULT_ENGINE, help="Path to stockfish.js or a compatible UCI script.")
    parser.add_argument("--engine-static-weight", type=float, default=0.60)
    parser.add_argument("--engine-intent-weight", type=float, default=0.20)
    parser.add_argument("--engine-result-weight", type=float, default=0.20)
    parser.add_argument("--phase-filter", dest="phase_filter", action="store_true", default=True)
    parser.add_argument("--no-phase-filter", dest="phase_filter", action="store_false")
    parser.add_argument("--max-phase-delta", type=float, default=0.25)
    parser.add_argument("--compatibility-filter", dest="compatibility_filter", action="store_true", default=True)
    parser.add_argument("--no-compatibility-filter", dest="compatibility_filter", action="store_false")
    parser.add_argument("--eval-cp", type=float, default=None, help="Optional query eval in centipawns.")
    parser.add_argument(
        "--eval-sidecar",
        type=Path,
        default=None,
        help="Optional CSV/JSON sidecar with FEN and eval cp columns/fields.",
    )
    parser.add_argument("--max-eval-delta", type=float, default=0.30)
    parser.add_argument(
        "--eval-perspective",
        choices=["white", "side-to-move"],
        default="side-to-move",
        help=(
            "Perspective used for normalized eval compatibility. Side-to-move converts "
            "white-perspective cp by flipping positions where black is to move."
        ),
    )
    args = parser.parse_args()

    chess.Board(args.fen)
    args.pgn_zip = resolve_pgn_zip(args.pgn_zip)
    if not args.pgn_zip.exists():
        raise FileNotFoundError(f"PGN zip not found: {args.pgn_zip}")
    if args.positions_per_game < 1:
        raise ValueError("--positions-per-game must be >= 1")
    if args.min_ply is not None and args.min_ply < 0:
        raise ValueError("--min-ply must be >= 0")
    if args.keep < 1:
        raise ValueError("--keep must be >= 1")
    if args.time_limit_seconds < 0:
        raise ValueError("--time-limit-seconds must be >= 0")
    if args.engine_rerank_top < 1:
        raise ValueError("--engine-rerank-top must be >= 1")
    if args.engine_movetime_ms < 1:
        raise ValueError("--engine-movetime-ms must be >= 1")
    if args.engine_multipv < 1:
        raise ValueError("--engine-multipv must be >= 1")
    if args.engine_rerank:
        args.engine_path = resolve_engine_path(args.engine_path)
        if not args.engine_path.exists():
            raise FileNotFoundError(f"Stockfish engine not found: {args.engine_path}")
        total_engine_weight = args.engine_static_weight + args.engine_intent_weight + args.engine_result_weight
        if total_engine_weight <= 0:
            raise ValueError("Engine rerank weights must sum to a positive number")
        args.engine_static_weight /= total_engine_weight
        args.engine_intent_weight /= total_engine_weight
        args.engine_result_weight /= total_engine_weight
    if args.max_phase_delta < 0:
        raise ValueError("--max-phase-delta must be >= 0")
    if args.max_eval_delta < 0:
        raise ValueError("--max-eval-delta must be >= 0")
    if args.eval_sidecar is not None:
        args.eval_sidecar = resolve_sidecar_path(args.eval_sidecar)
    else:
        args.eval_sidecar = find_default_eval_sidecar(args.pgn_zip)
    return args


def resolve_engine_path(path: Path) -> Path:
    if path.is_absolute():
        return path
    candidates = [
        Path.cwd() / path,
        REPO_ROOT / path,
        REPO_ROOT / path.name,
        REPO_ROOT / "stockfish-windows-x86-64-avx2.exe",
        REPO_ROOT / "public" / "analyze" / path.name,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def resolve_pgn_zip(path: Path) -> Path:
    if path.is_absolute():
        return path

    candidates = [
        Path.cwd() / path,
        REPO_ROOT / path,
        REPO_ROOT / "maia2-skill-adaptation" / path.name,
        REPO_ROOT / "maia2-skill-adaptation" / "maia2-skill-adaptation" / path.name,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def resolve_sidecar_path(path: Path) -> Path:
    if path.is_absolute():
        return path
    candidates = [
        Path.cwd() / path,
        REPO_ROOT / path,
        REPO_ROOT / "maia2-skill-adaptation" / path.name,
        REPO_ROOT / "maia2-skill-adaptation" / "maia2-skill-adaptation" / path.name,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def find_default_eval_sidecar(pgn_zip: Path) -> Path | None:
    candidates = [
        pgn_zip.with_suffix(".evals.csv"),
        pgn_zip.with_suffix(".evals.json"),
        pgn_zip.with_suffix(".eval.csv"),
        pgn_zip.with_suffix(".eval.json"),
        pgn_zip.parent / "evals.csv",
        pgn_zip.parent / "evals.json",
    ]
    return next((candidate for candidate in candidates if candidate.exists()), None)


def parse_checkpoints(raw: str) -> list[int]:
    checkpoints = sorted(
        {
            int(part.replace("_", "").strip())
            for part in raw.split(",")
            if part.strip()
        }
    )
    return [value for value in checkpoints if value > 0]


def load_eval_index(path: Path | None) -> EvalIndex | None:
    if path is None:
        return None
    if not path.exists():
        raise FileNotFoundError(f"Eval sidecar not found: {path}")

    if path.suffix.lower() == ".csv":
        rows = read_eval_csv(path)
    else:
        rows = read_eval_json(path)

    values_by_key: dict[str, float] = {}
    for row in rows:
        fen = first_string(row, ["fen", "FEN", "position_fen", "positionFen", "position", "epd"])
        cp = first_number(row, ["eval_cp", "evalCp", "cp", "centipawns", "score_cp", "scoreCp", "eval"])
        if not fen or cp is None:
            continue
        try:
            board = chess.Board(fen)
        except ValueError:
            continue
        for key in fen_keys(board):
            values_by_key[key] = cp

    return EvalIndex(path=path, values_by_key=values_by_key)


def read_eval_csv(path: Path) -> list[dict[str, object]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def read_eval_json(path: Path) -> list[dict[str, object]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        for key in ["positions", "items", "records", "data", "evals"]:
            value = payload.get(key)
            if isinstance(value, list):
                return [row for row in value if isinstance(row, dict)]
        rows: list[dict[str, object]] = []
        for fen, cp in payload.items():
            if isinstance(fen, str) and isinstance(cp, (int, float, str)):
                rows.append({"fen": fen, "eval_cp": cp})
        return rows
    return []


def first_string(row: dict[str, object], keys: list[str]) -> str:
    for key in keys:
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def first_number(row: dict[str, object], keys: list[str]) -> float | None:
    for key in keys:
        value = row.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str) and value.strip():
            try:
                return float(value.strip())
            except ValueError:
                continue
    return None


def fen_keys(board: chess.Board) -> list[str]:
    full = board.fen()
    parts = full.split()
    return [
        full,
        " ".join(parts[:4]),
        f"{board.board_fen()} {board.turn}",
        board.board_fen(),
    ]


def normalize_eval_cp(cp: float, board: chess.Board, perspective: str) -> float:
    perspective_cp = cp
    if perspective == "side-to-move" and board.turn == chess.BLACK:
        perspective_cp = -cp
    return math.tanh(perspective_cp / 400.0)


def rerank_with_engine(
    args: argparse.Namespace,
    query_fen: str,
    top_heap: list[ScoredPosition],
    structural_worker: SimilarityWorker,
) -> list[ScoredPosition]:
    candidates = sorted(top_heap, key=lambda item: item.structural_score, reverse=True)[: args.engine_rerank_top]
    if not candidates:
        return top_heap

    print(
        f"\n{warn('Engine rerank')} analyzing {accent(len(candidates))} candidates at "
        f"{accent(args.engine_movetime_ms)}ms/position...",
        flush=True,
    )

    module = load_stockfish_rerank_module()
    probe = module.StockfishProbe(args.engine_path.resolve(), args.engine_multipv)
    result_worker: SimilarityWorker | None = None
    try:
        query_response = probe.analyze(query_fen, args.engine_movetime_ms)
        query_intent = query_response.get("bestmoveIntent") if isinstance(query_response, dict) else None
        query_result_fen = query_response.get("resultFen") if isinstance(query_response, dict) else None
        print(
            f"{muted('Query engine')} best={accent(query_response.get('bestmove', ''))} "
            f"eval_white={accent(format_engine_eval(query_response))}",
            flush=True,
        )
        if isinstance(query_result_fen, str):
            result_worker = SimilarityWorker(query_result_fen)

        for item in candidates:
            response = probe.analyze(item.fen, args.engine_movetime_ms)
            candidate_intent = response.get("bestmoveIntent") if isinstance(response, dict) else None
            candidate_result_fen = response.get("resultFen") if isinstance(response, dict) else None
            intent_score = move_intent_similarity(query_intent, candidate_intent)
            result_score = 0.0
            if result_worker is not None and isinstance(candidate_result_fen, str):
                try:
                    result_score = float(result_worker.score(candidate_result_fen)["score"])
                except Exception:
                    result_score = 0.0
            eval_compat_score = engine_eval_compatibility(query_response, response)

            base_engine_score = clamp01_py(
                item.structural_score * args.engine_static_weight
                + intent_score * args.engine_intent_weight
                + result_score * args.engine_result_weight
            )
            final_score = clamp01_py(base_engine_score * (0.10 + 0.90 * eval_compat_score))
            item.score = final_score
            item.final_score = final_score
            item.engine_intent_score = intent_score
            item.engine_result_score = result_score
            item.engine_eval_compat_score = eval_compat_score
            item.engine_bestmove = str(response.get("bestmove") or "")
            item.engine_eval_cp = optional_float(response.get("evalCp"))
            item.engine_eval_white_cp = optional_float(response.get("evalCpWhite"))
            item.engine_mate = optional_float(response.get("mate"))
            item.engine_mate_white = optional_float(response.get("mateWhite"))
            item.engine_gap_cp = optional_float(response.get("bestMoveGapCp"))
    finally:
        if result_worker is not None:
            result_worker.close()
        probe.close()

    heapq.heapify(candidates)
    return candidates


def load_stockfish_rerank_module():
    spec = importlib.util.spec_from_file_location("stockfish_10ms_rerank", STOCKFISH_RERANK_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {STOCKFISH_RERANK_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def move_intent_similarity(left: object, right: object) -> float:
    if not isinstance(left, dict) or not isinstance(right, dict):
        return 0.0
    weighted_fields: list[tuple[str, float]] = [
        ("piece", 1.5),
        ("fromRegion", 0.6),
        ("toRegion", 1.0),
        ("isCapture", 1.0),
        ("capturedPiece", 0.8),
        ("isCheck", 1.2),
        ("isPromotion", 1.2),
        ("isCastle", 0.8),
        ("isPawnPush", 0.7),
        ("isPawnBreak", 0.9),
        ("movesToKingZone", 0.9),
        ("attacksKingZoneAfterMove", 0.9),
    ]
    matched = 0.0
    total = 0.0
    for field, weight in weighted_fields:
        total += weight
        if left.get(field) == right.get(field):
            matched += weight

    left_delta = left.get("promotionDistanceDelta")
    right_delta = right.get("promotionDistanceDelta")
    if isinstance(left_delta, (int, float)) or isinstance(right_delta, (int, float)):
        total += 0.8
        if left_delta == right_delta:
            matched += 0.8

    return clamp01_py(matched / total if total else 0.0)


def engine_eval_compatibility(query: dict[str, object], candidate: dict[str, object]) -> float:
    query_mate = optional_float(query.get("mateWhite"))
    candidate_mate = optional_float(candidate.get("mateWhite"))
    query_cp = optional_float(query.get("evalCpWhite"))
    candidate_cp = optional_float(candidate.get("evalCpWhite"))

    if query_mate is not None:
        if candidate_mate is None:
            return 0.18 if same_eval_side(query_cp, candidate_cp) else 0.0
        if math.copysign(1, query_mate) != math.copysign(1, candidate_mate):
            return 0.0
        mate_distance_delta = abs(abs(query_mate) - abs(candidate_mate))
        if mate_distance_delta <= 1:
            return 1.0
        if mate_distance_delta <= 2:
            return 0.9
        if mate_distance_delta <= 4:
            return 0.72
        return max(0.25, 1 - mate_distance_delta / 12)

    if candidate_mate is not None:
        return 0.25 if same_eval_side(query_cp, candidate_cp) else 0.0

    if query_cp is None or candidate_cp is None:
        return 0.5
    if not same_eval_side(query_cp, candidate_cp):
        return 0.0

    delta = abs(query_cp - candidate_cp)
    scale = max(300.0, abs(query_cp) * 0.6)
    return clamp01_py(1 - delta / scale)


def same_eval_side(left_cp: float | None, right_cp: float | None) -> bool:
    if left_cp is None or right_cp is None:
        return True
    if abs(left_cp) < 80 or abs(right_cp) < 80:
        return True
    return (left_cp > 0) == (right_cp > 0)


def format_engine_eval(response: dict[str, object]) -> str:
    mate = optional_float(response.get("mateWhite"))
    if mate is not None:
        side = "+" if mate > 0 else "-"
        return f"#{side}{abs(mate):.0f}"
    cp = optional_float(response.get("evalCpWhite"))
    return format_eval_cp(cp)


def optional_float(value: object) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def top_for_display(heap: list[ScoredPosition], keep: int) -> list[ScoredPosition]:
    return sorted(heap, key=lambda item: item.score, reverse=True)[:keep]


def clamp01_py(value: float) -> float:
    if math.isnan(value):
        return 0.0
    return max(0.0, min(1.0, value))


def phase_profiles_compatible(query: dict[str, object], candidate: dict[str, object]) -> bool:
    query_phase = float(query.get("phaseScore", 0.0))
    candidate_material_ratio = float(candidate.get("materialRatio", 1.0))
    query_material_ratio = float(query.get("materialRatio", 1.0))
    query_material_class = str(query.get("materialClass", ""))

    low_material_classes = {
        "minor_pawn_endgame",
        "pawn_endgame",
        "bare_kings",
        "no_heavy_piece_endgame",
    }
    if query_material_class in low_material_classes:
        if bool(candidate.get("heavyPiecesPresent", True)):
            return False
        if candidate_material_ratio > max(query_material_ratio + 0.20, 0.55):
            return False

    if query_phase >= 0.55 and not bool(query.get("queensPresent", True)):
        if bool(candidate.get("queensPresent", False)):
            return False
    if query_phase >= 0.70 and not bool(query.get("rooksPresent", True)):
        if bool(candidate.get("rooksPresent", False)):
            return False

    if query_phase < 0.65:
        query_safety = query.get("kingSafety")
        candidate_safety = candidate.get("kingSafety")
        if isinstance(query_safety, dict) and isinstance(candidate_safety, dict):
            for color in ["w", "b"]:
                query_label = str(query_safety.get(color, ""))
                candidate_label = str(candidate_safety.get(color, ""))
                if query_label.startswith("castled") and query_label != candidate_label:
                    return False

    return True


def phase_summary(profile: dict[str, object]) -> str:
    score = float(profile.get("phaseScore", 0.0))
    material_ratio = float(profile.get("materialRatio", 0.0))
    material = profile.get("materialClass", "unknown")
    safety = profile.get("kingSafety", {})
    white_safety = safety.get("w", "?") if isinstance(safety, dict) else "?"
    black_safety = safety.get("b", "?") if isinstance(safety, dict) else "?"
    return (
        f"phase={accent(profile.get('inferredPhase', 'unknown'))} "
        f"score={accent(f'{score:.3f}')} material_ratio={accent(f'{material_ratio:.3f}')} "
        f"class={accent(material)} king_safety={accent(f'w:{white_safety},b:{black_safety}')}"
    )


def format_optional(value: float | None) -> str:
    return "none" if value is None else f"{value:.3f}"


def format_eval_cp(value: float | None) -> str:
    return "none" if value is None else f"{value:.0f}"


def format_engine_item_eval(item: ScoredPosition) -> str:
    if item.engine_mate_white is not None:
        side = "+" if item.engine_mate_white > 0 else "-"
        return f"#{side}{abs(item.engine_mate_white):.0f}"
    return format_eval_cp(item.engine_eval_white_cp)


def read_games(zip_path: Path) -> Iterable[chess.pgn.Game]:
    with zipfile.ZipFile(zip_path) as archive:
        pgn_members = [
            member
            for member in archive.infolist()
            if member.filename.lower().endswith(".pgn")
        ]
        if not pgn_members:
            raise RuntimeError(f"No .pgn member found inside {zip_path}")

        with archive.open(pgn_members[0], "r") as raw:
            text = io.TextIOWrapper(raw, encoding="utf-8", errors="replace", newline="")
            while True:
                game = chess.pgn.read_game(text)
                if game is None:
                    break
                yield game


def sample_positions_from_game(
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

    sampled_plies = set(rng.sample(eligible, min(positions_per_game, len(eligible))))
    positions: list[dict[str, object]] = []
    board = game.board()
    for ply, move in enumerate(moves, start=1):
        board.push(move)
        if ply in sampled_plies:
            positions.append(
                {
                    "fen": board.fen(),
                    "game_index": game_index,
                    "ply": ply,
                }
            )
    return positions


def push_top(heap: list[ScoredPosition], item: ScoredPosition, keep: int) -> None:
    if len(heap) < keep:
        heapq.heappush(heap, item)
        return
    if item.score > heap[0].score:
        heapq.heapreplace(heap, item)


def print_checkpoint(
    label: str,
    top_heap: list[ScoredPosition],
    scored_count: int,
    game_count: int,
    elapsed: float,
    since_last: float,
    eval_rejected_count: int,
    eval_missing_count: int,
    eval_enabled: bool,
    phase_rejected_count: int,
    compatibility_rejected_count: int,
    phase_filter_enabled: bool,
    compatibility_filter_enabled: bool,
) -> None:
    top = sorted(top_heap, key=lambda item: item.score, reverse=True)
    max_score = top[0].score if top else 0.0
    rate = scored_count / elapsed if elapsed > 0 else 0.0
    rule = colored("─" * 88, "blue")
    print(
        rule,
        flush=True,
    )
    print(
        " ".join(
            [
                bold(label.upper()),
                metric("positions", f"{scored_count:,}"),
                metric("games", f"{game_count:,}"),
                metric("max", f"{max_score:.3f}", color=score_color(max_score)),
                metric("elapsed", format_duration(elapsed)),
                metric("since_last", format_duration(since_last)),
                metric("rate", f"{rate:.1f}/s"),
                metric("eval_rejected", f"{eval_rejected_count:,}", color="red" if eval_rejected_count else "cyan"),
                metric("phase_rejected", f"{phase_rejected_count:,}", color="red" if phase_rejected_count else "cyan"),
                metric(
                    "compat_rejected",
                    f"{compatibility_rejected_count:,}",
                    color="red" if compatibility_rejected_count else "cyan",
                ),
            ]
        ),
        flush=True,
    )
    if phase_filter_enabled or compatibility_filter_enabled:
        print(
            f"{muted('Phase filters')} phase_mismatch={colored(f'{phase_rejected_count:,}', 'red', attrs=['bold'])} "
            f"compatibility_mismatch={colored(f'{compatibility_rejected_count:,}', 'red', attrs=['bold'])}",
            flush=True,
        )
    if eval_enabled:
        print(
            f"{muted('Eval gate')} rejected_due_to_mismatch={colored(f'{eval_rejected_count:,}', 'red', attrs=['bold'])} "
            f"missing_candidate_eval={accent(f'{eval_missing_count:,}')}",
            flush=True,
        )
    print(rule, flush=True)
    for rank, item in enumerate(top, start=1):
        breakdown = "  ".join(
            metric(key, f"{value:.3f}", color=score_color(value))
            for key, value in item.breakdown.items()
        )
        print(
            f"{rank_badge(rank)} {metric('structural', f'{item.structural_score:.3f}', color=score_color(item.structural_score))} "
            f"{metric('final', f'{item.final_score:.3f}', color=score_color(item.final_score))} "
            f"{metric('game', item.game_index)} {metric('ply', item.ply)}  {breakdown}",
            flush=True,
        )
        print(f"   {muted('phase')}  {phase_summary(item.phase_profile)}", flush=True)
        if item.engine_bestmove:
            print(
                f"   {muted('engine')} best={accent(item.engine_bestmove)} "
                f"eval={format_engine_item_eval(item)} raw_cp={format_eval_cp(item.engine_eval_cp)} "
                f"gap={format_eval_cp(item.engine_gap_cp)} compat={format_optional(item.engine_eval_compat_score)} "
                f"intent={format_optional(item.engine_intent_score)} result={format_optional(item.engine_result_score)}",
                flush=True,
            )
        print(
            f"   {muted('eval')}   cp={format_eval_cp(item.eval_cp)} "
            f"norm={format_optional(item.norm_eval)} delta={format_optional(item.eval_delta)}",
            flush=True,
        )
        players = " - ".join(part for part in [item.white, item.black] if part)
        if players:
            print(f"   {muted('players')} {players}", flush=True)
        if item.site:
            print(f"   {muted('site')}    {item.site}", flush=True)
        print(f"   {muted('fen')}     {item.fen}", flush=True)
    print("", flush=True)


def format_duration(seconds: float) -> str:
    if seconds < 1:
        return f"{seconds * 1000:.0f}ms"
    minutes, secs = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours >= 1:
        return f"{int(hours)}h{int(minutes):02d}m{secs:04.1f}s"
    if minutes >= 1:
        return f"{int(minutes)}m{secs:04.1f}s"
    return f"{seconds:.2f}s"


def score_color(value: float) -> str:
    if value >= 0.8:
        return "green"
    if value >= 0.6:
        return "yellow"
    if value >= 0.4:
        return "cyan"
    return "white"


def metric(label: str, value: object, color: str = "cyan") -> str:
    return f"{muted(label)}={colored(value, color, attrs=['bold'])}"


def rank_badge(rank: int) -> str:
    colors = {1: "green", 2: "yellow", 3: "cyan"}
    return colored(f"{rank}.", colors.get(rank, "white"), attrs=["bold"])


def bold(value: object) -> str:
    return colored(value, "white", attrs=["bold"])


def accent(value: object) -> str:
    return colored(value, "cyan", attrs=["bold"])


def muted(value: object) -> str:
    return colored(value, "dark_grey")


def warn(value: object) -> str:
    return colored(value, "yellow", attrs=["bold"])


if __name__ == "__main__":
    raise SystemExit(main())

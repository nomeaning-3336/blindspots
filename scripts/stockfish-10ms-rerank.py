#!/usr/bin/env python3
"""Run a very small Stockfish budget over FENs and emit engine-response JSONL.

This is intended as a second-stage compatibility/rerank probe after the fast
deterministic FEN similarity scanner has already produced a shortlist.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import chess


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENGINE = (
    REPO_ROOT / "stockfish-windows-x86-64-avx2.exe"
    if (REPO_ROOT / "stockfish-windows-x86-64-avx2.exe").exists()
    else REPO_ROOT / "stockfish.js"
)
INFO_SCORE_RE = re.compile(r"\bscore\s+(cp|mate)\s+(-?\d+)")
INFO_MULTIPV_RE = re.compile(r"\bmultipv\s+(\d+)")
INFO_PV_RE = re.compile(r"\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)")


@dataclass
class EngineLine:
    multipv: int
    move: str
    score_cp: int | None
    mate: int | None


class StockfishProbe:
    def __init__(self, engine: Path, multipv: int) -> None:
        if not engine.exists():
            raise FileNotFoundError(f"Stockfish engine not found: {engine}")

        command = [str(engine)] if engine.suffix.lower() == ".exe" else ["node", str(engine)]
        self.process = subprocess.Popen(
            command,
            cwd=engine.parent,
            env={**os.environ, "NODE_NO_WARNINGS": "1"},
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        self._send("uci")
        self._read_until("uciok", timeout_lines=10_000)
        self._send(f"setoption name MultiPV value {multipv}")
        self._send("isready")
        self._read_until("readyok", timeout_lines=10_000)

    def analyze(self, fen: str, movetime_ms: int) -> dict[str, object]:
        board = chess.Board(fen)
        self._send(f"position fen {board.fen()}")
        self._send(f"go movetime {movetime_ms}")

        info_lines: dict[int, EngineLine] = {}
        bestmove = ""
        while True:
            line = self._readline()
            if line.startswith("bestmove "):
                bestmove = line.split()[1]
                break
            parsed = parse_info_line(line)
            if parsed is not None:
                info_lines[parsed.multipv] = parsed

        top_lines = sorted(info_lines.values(), key=lambda item: item.multipv)
        if bestmove and all(line.move != bestmove for line in top_lines):
            top_lines.insert(0, EngineLine(multipv=1, move=bestmove, score_cp=None, mate=None))

        best_eval = top_lines[0].score_cp if top_lines else None
        second_eval = top_lines[1].score_cp if len(top_lines) > 1 else None
        best_mate = top_lines[0].mate if top_lines else None
        gap_cp = abs(best_eval - second_eval) if best_eval is not None and second_eval is not None else None
        perspective = 1 if board.turn == chess.WHITE else -1

        return {
            "fen": board.fen(),
            "engine": "stockfish",
            "movetimeMs": movetime_ms,
            "bestmove": bestmove,
            "bestmoveIntent": move_intent(board, bestmove) if bestmove else None,
            "resultFen": result_fen(board, bestmove) if bestmove else None,
            "evalCp": best_eval,
            "evalCpWhite": best_eval * perspective if best_eval is not None else None,
            "mate": best_mate,
            "mateWhite": best_mate * perspective if best_mate is not None else None,
            "secondEvalCp": second_eval,
            "bestMoveGapCp": gap_cp,
            "topMoves": [
                {
                    "rank": index + 1,
                    "uci": line.move,
                    "evalCp": line.score_cp,
                    "evalCpWhite": line.score_cp * perspective if line.score_cp is not None else None,
                    "mate": line.mate,
                    "mateWhite": line.mate * perspective if line.mate is not None else None,
                    "intent": move_intent(board, line.move),
                    "resultFen": result_fen(board, line.move),
                }
                for index, line in enumerate(top_lines)
            ],
        }

    def close(self) -> None:
        try:
            self._send("quit")
        except Exception:
            pass
        try:
            self.process.terminate()
            self.process.wait(timeout=2)
        except Exception:
            self.process.kill()

    def _send(self, command: str) -> None:
        if not self.process.stdin:
            raise RuntimeError("Stockfish stdin is closed.")
        self.process.stdin.write(command + "\n")
        self.process.stdin.flush()

    def _readline(self) -> str:
        if not self.process.stdout:
            raise RuntimeError("Stockfish stdout is closed.")
        line = self.process.stdout.readline()
        if not line:
            stderr = self.process.stderr.read() if self.process.stderr else ""
            raise RuntimeError(f"Stockfish produced no response: {stderr}")
        return line.strip()

    def _read_until(self, marker: str, timeout_lines: int) -> None:
        for _ in range(timeout_lines):
            if self._readline() == marker:
                return
        raise TimeoutError(f"Stockfish did not emit {marker}.")


def parse_info_line(line: str) -> EngineLine | None:
    if not line.startswith("info "):
        return None
    pv_match = INFO_PV_RE.search(line)
    if not pv_match:
        return None
    multipv_match = INFO_MULTIPV_RE.search(line)
    score_match = INFO_SCORE_RE.search(line)
    score_cp: int | None = None
    mate: int | None = None
    if score_match:
        kind, value_raw = score_match.groups()
        value = int(value_raw)
        if kind == "cp":
            score_cp = value
        else:
            mate = value
            score_cp = 100_000 if value > 0 else -100_000
    return EngineLine(
        multipv=int(multipv_match.group(1)) if multipv_match else 1,
        move=pv_match.group(1),
        score_cp=score_cp,
        mate=mate,
    )


def move_intent(board: chess.Board, uci: str) -> dict[str, object]:
    move = chess.Move.from_uci(uci)
    if move not in board.legal_moves:
        return {"uci": uci, "legal": False}

    piece = board.piece_at(move.from_square)
    captured = board.piece_at(move.to_square)
    moving_piece = chess.piece_name(piece.piece_type) if piece else "unknown"
    is_capture = board.is_capture(move)
    is_castle = board.is_castling(move)
    is_pawn_push = piece is not None and piece.piece_type == chess.PAWN and not is_capture
    is_pawn_break = piece is not None and piece.piece_type == chess.PAWN and is_capture and chess.square_file(move.to_square) in [3, 4]

    after = board.copy(stack=False)
    after.push(move)
    enemy_king = after.king(not after.turn)
    attacks_king_zone = False
    if enemy_king is not None:
        zone = king_zone(enemy_king)
        attacks_king_zone = any(after.is_attacked_by(board.turn, square) for square in zone)

    return {
        "uci": uci,
        "legal": True,
        "piece": moving_piece,
        "fromRegion": square_region(move.from_square),
        "toRegion": square_region(move.to_square),
        "isCapture": is_capture,
        "capturedPiece": chess.piece_name(captured.piece_type) if captured else None,
        "isCheck": after.is_check(),
        "isPromotion": move.promotion is not None,
        "promotionPiece": chess.piece_name(move.promotion) if move.promotion else None,
        "isCastle": is_castle,
        "isPawnPush": is_pawn_push,
        "isPawnBreak": is_pawn_break,
        "movesToKingZone": enemy_king is not None and move.to_square in king_zone(enemy_king),
        "attacksKingZoneAfterMove": attacks_king_zone,
        "promotionDistanceDelta": promotion_distance_delta(board, move),
    }


def result_fen(board: chess.Board, uci: str) -> str | None:
    move = chess.Move.from_uci(uci)
    if move not in board.legal_moves:
        return None
    after = board.copy(stack=False)
    after.push(move)
    return after.fen()


def promotion_distance_delta(board: chess.Board, move: chess.Move) -> int | None:
    piece = board.piece_at(move.from_square)
    if piece is None or piece.piece_type != chess.PAWN:
        return None
    before = pawn_promotion_distance(piece.color, move.from_square)
    after = pawn_promotion_distance(piece.color, move.to_square)
    return before - after


def pawn_promotion_distance(color: chess.Color, square: chess.Square) -> int:
    rank = chess.square_rank(square)
    return 7 - rank if color == chess.WHITE else rank


def king_zone(square: chess.Square) -> set[chess.Square]:
    file = chess.square_file(square)
    rank = chess.square_rank(square)
    squares: set[chess.Square] = {square}
    for df in [-1, 0, 1]:
        for dr in [-1, 0, 1]:
            next_file = file + df
            next_rank = rank + dr
            if 0 <= next_file <= 7 and 0 <= next_rank <= 7:
                squares.add(chess.square(next_file, next_rank))
    return squares


def square_region(square: chess.Square) -> str:
    file = chess.square_file(square)
    rank = chess.square_rank(square)
    if rank in [0, 7]:
        return "promotion_zone"
    if 2 <= file <= 5 and 2 <= rank <= 5:
        return "center"
    if rank <= 3:
        return "white_queenside" if file <= 3 else "white_kingside"
    return "black_queenside" if file <= 3 else "black_kingside"


def iter_fens(args: argparse.Namespace) -> Iterable[str]:
    for fen in args.fen:
        yield fen
    if args.fens_file:
        with args.fens_file.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                if line.startswith("{"):
                    payload = json.loads(line)
                    fen = payload.get("fen")
                    if isinstance(fen, str):
                        yield fen
                else:
                    yield line


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run bundled Stockfish for a tiny fixed budget per FEN and emit JSONL engine-response features."
    )
    parser.add_argument("--fen", action="append", default=[], help="FEN to analyze. Repeatable.")
    parser.add_argument("--fens-file", type=Path, default=None, help="Text/JSONL file containing FENs.")
    parser.add_argument("--engine", type=Path, default=DEFAULT_ENGINE, help="Path to stockfish.js or UCI-compatible Node script.")
    parser.add_argument("--movetime-ms", type=int, default=10, help="Stockfish time budget per position.")
    parser.add_argument("--multipv", type=int, default=3, help="Requested MultiPV count.")
    args = parser.parse_args()

    if not args.fen and args.fens_file is None:
        raise ValueError("Provide --fen or --fens-file.")
    if args.movetime_ms < 1:
        raise ValueError("--movetime-ms must be >= 1")
    if args.multipv < 1:
        raise ValueError("--multipv must be >= 1")
    return args


def main() -> int:
    args = parse_args()
    probe = StockfishProbe(args.engine.resolve(), args.multipv)
    try:
        for fen in iter_fens(args):
            result = probe.analyze(fen, args.movetime_ms)
            print(json.dumps(result, separators=(",", ":")), flush=True)
    finally:
        probe.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

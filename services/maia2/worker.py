#!/usr/bin/env python
import contextlib
import io
import json
import math
import random
import sys
import traceback
from pathlib import Path

from maia2.inference import inference_each, prepare
from maia2.model import from_pretrained


MODEL_ROOT = Path.cwd() / "cache" / "maia2-models"
PREPARED = prepare()
MODELS = {}


def send(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def clamp_int(value, minimum, maximum, fallback):
    try:
        parsed = int(round(float(value)))
    except Exception:
        return fallback
    return max(minimum, min(maximum, parsed))


def clamp_float(value, minimum, maximum, fallback):
    try:
        parsed = float(value)
    except Exception:
        return fallback
    if not math.isfinite(parsed):
        return fallback
    return max(minimum, min(maximum, parsed))


def get_model(model_type):
    normalized = str(model_type or "blitz").strip().lower()
    if normalized not in {"blitz", "rapid"}:
        normalized = "blitz"
    if normalized not in MODELS:
        with contextlib.redirect_stdout(io.StringIO()):
            MODELS[normalized] = from_pretrained(normalized, "cpu", save_root=str(MODEL_ROOT))
    return normalized, MODELS[normalized]


def top_moves_payload(move_probs, limit):
    entries = []
    for move, probability in list(move_probs.items())[:limit]:
        entries.append(
            {
                "uci": str(move),
                "probability": round(float(probability), 6),
            }
        )
    return entries


def sample_move(move_probs, top_k, temperature, seed):
    items = list(move_probs.items())
    if not items:
        raise ValueError("Maia returned no legal moves.")

    capped = items[: max(1, min(top_k, len(items)))]
    rng = random.Random(seed)

    if temperature <= 0:
        return capped[0][0]

    weights = []
    for _, probability in capped:
        prob = max(1e-9, float(probability))
        weights.append(prob ** (1.0 / temperature))

    total = sum(weights)
    if total <= 0:
        return capped[0][0]

    target = rng.random() * total
    running = 0.0
    for index, (move, _) in enumerate(capped):
        running += weights[index]
        if target <= running:
            return move
    return capped[-1][0]


def handle_move(request):
    request_id = str(request.get("id") or "").strip()
    fen = str(request.get("fen") or "").strip()
    if not fen:
        raise ValueError("FEN is required.")

    model_type, model = get_model(request.get("model_type") or "blitz")
    elo_self = clamp_int(request.get("elo_self"), 600, 3000, 1500)
    elo_oppo = clamp_int(request.get("elo_oppo"), 600, 3000, 1500)
    top_k = clamp_int(request.get("top_k"), 1, 24, 8)
    top_moves = clamp_int(request.get("top_moves"), 1, 24, 8)
    temperature = clamp_float(request.get("temperature"), 0.0, 2.5, 1.0)
    seed = request.get("seed")

    move_probs, win_prob = inference_each(
        model,
        PREPARED,
        fen,
        elo_self,
        elo_oppo,
    )
    chosen_move = sample_move(move_probs, top_k, temperature, seed)

    send(
        {
            "id": request_id,
            "ok": True,
            "model_type": model_type,
            "elo_self": elo_self,
            "elo_oppo": elo_oppo,
            "move": chosen_move,
            "win_prob": round(float(win_prob), 6),
            "top_moves": top_moves_payload(move_probs, top_moves),
        }
    )


def main():
    send({"event": "ready"})
    for raw_line in sys.stdin:
        line = str(raw_line or "").strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
            action = str(payload.get("action") or "").strip().lower()
            if action == "move":
                handle_move(payload)
            else:
                send(
                    {
                        "id": str(payload.get("id") or ""),
                        "ok": False,
                        "error": f"Unsupported action: {action or 'unknown'}",
                    }
                )
        except Exception as exc:
            send(
                {
                    "id": str(locals().get("payload", {}).get("id") or ""),
                    "ok": False,
                    "error": str(exc),
                    "traceback": traceback.format_exc(limit=3),
                }
            )


if __name__ == "__main__":
    main()

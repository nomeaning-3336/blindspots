const GRAPH_EVAL_RANGE = 14;

export function formatEvalLabel(cp?: number | null, mate?: number | null): string {
  if (typeof mate === "number") {
    if (mate === 0) return "M0";
    return mate > 0 ? `M${mate}` : `M${mate}`;
  }
  if (typeof cp !== "number" || !Number.isFinite(cp)) return "—";
  const pawns = cp / 100;
  if (Math.abs(pawns) < 0.05) return "0.0";
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

export function formatLossLabel(cpLoss?: number | null, mateAfter?: number | null): string {
  if (typeof mateAfter === "number") {
    return mateAfter < 0 ? "Mate" : "—";
  }
  if (typeof cpLoss !== "number" || !Number.isFinite(cpLoss)) return "—";
  return `${Math.round(cpLoss)}cp`;
}

export function graphValueFromEval(cp?: number | null, mate?: number | null): number {
  if (typeof mate === "number") {
    return mate > 0 ? GRAPH_EVAL_RANGE : -GRAPH_EVAL_RANGE;
  }
  if (typeof cp !== "number" || !Number.isFinite(cp)) return 0;
  return Math.max(-GRAPH_EVAL_RANGE, Math.min(GRAPH_EVAL_RANGE, cp / 100));
}

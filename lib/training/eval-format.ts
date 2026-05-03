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
    return mate > 0 ? 10 : -10;
  }
  if (typeof cp !== "number" || !Number.isFinite(cp)) return 0;
  return Math.max(-10, Math.min(10, cp / 100));
}

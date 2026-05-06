const GRAPH_EVAL_RANGE = 14;
const TERMINAL_MATE_VISUAL_CP = 10000;
const ENGINE_MATE_SENTINEL_CP = 100000;
const ENGINE_MATE_SENTINEL_STEP_CP = 1000;

export function formatEvalLabel(cp?: number | null, mate?: number | null): string {
  if (typeof mate === "number") {
    return `M${Math.abs(mate)}`;
  }
  const inferredMate = inferMateDistanceFromCp(cp);
  if (typeof inferredMate === "number") return `M${inferredMate}`;
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

function inferMateDistanceFromCp(cp?: number | null): number | null {
  if (typeof cp !== "number" || !Number.isFinite(cp)) return null;
  const absCp = Math.abs(Math.round(cp));
  if (absCp === TERMINAL_MATE_VISUAL_CP) return 0;
  if (absCp < TERMINAL_MATE_VISUAL_CP || absCp > ENGINE_MATE_SENTINEL_CP) return null;
  const distance = Math.round((ENGINE_MATE_SENTINEL_CP - absCp) / ENGINE_MATE_SENTINEL_STEP_CP);
  if (distance < 0 || distance > 99) return null;
  const expectedCp = ENGINE_MATE_SENTINEL_CP - distance * ENGINE_MATE_SENTINEL_STEP_CP;
  return Math.abs(absCp - expectedCp) <= 1 ? distance : null;
}

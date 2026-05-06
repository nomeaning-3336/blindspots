import { Chess } from "chess.js";

export type PostmortemTerminalDisplay = {
  evalCp: number | null;
  evalMate: number | null;
  engineEmptyMessage: string | null;
};

const GAME_OVER_EMPTY_MESSAGE = "Game over. No more moves available.";
const TERMINAL_MATE_CP = 600;

export function getPostmortemTerminalDisplay(fen: string): PostmortemTerminalDisplay {
  try {
    const chess = new Chess(fen);

    if (chess.isCheckmate()) {
      return {
        evalCp: chess.turn() === "w" ? -TERMINAL_MATE_CP : TERMINAL_MATE_CP,
        evalMate: 0,
        engineEmptyMessage: GAME_OVER_EMPTY_MESSAGE,
      };
    }

    if (chess.isGameOver()) {
      return {
        evalCp: 0,
        evalMate: null,
        engineEmptyMessage: GAME_OVER_EMPTY_MESSAGE,
      };
    }
  } catch {
    // Ignore invalid FENs and leave postmortem display unchanged.
  }

  return {
    evalCp: null,
    evalMate: null,
    engineEmptyMessage: null,
  };
}

export function formatPostmortemEvalLabel(cp?: number | null, mate?: number | null) {
  if (typeof mate === "number") return `M${Math.abs(mate)}`;
  if (typeof cp !== "number" || !Number.isFinite(cp)) return "--";
  if (Math.abs(cp) >= 600) return cp > 0 ? "+6.0" : "-6.0";
  const pawns = cp / 100;
  if (Math.abs(pawns) < 0.05) return "0.0";
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

export function getEvalBarFill(cp?: number | null, mate?: number | null, mateCp?: number | null) {
  const decisiveCp = typeof mate === "number" && typeof mateCp === "number" && mateCp !== 0
    ? mateCp
    : null;

  if (typeof decisiveCp === "number") {
    return decisiveCp > 0
      ? { whitePct: 100, blackPct: 0, decisiveSide: "white" as const }
      : { whitePct: 0, blackPct: 100, decisiveSide: "black" as const };
  }

  const clamped = typeof cp === "number" ? Math.max(-600, Math.min(600, cp)) : 0;
  const whitePct = 50 + (clamped / 600) * 42;
  return {
    whitePct,
    blackPct: 100 - whitePct,
    decisiveSide: null,
  };
}

export function whitePositiveMateCp(fen: string, mate?: number | null, cp?: number | null) {
  if (typeof mate !== "number") return null;

  if (mate === 0) {
    if (typeof cp === "number" && Number.isFinite(cp) && cp !== 0) {
      return Math.sign(cp) * TERMINAL_MATE_CP;
    }

    try {
      const chess = new Chess(fen);
      if (chess.isCheckmate()) return chess.turn() === "w" ? -TERMINAL_MATE_CP : TERMINAL_MATE_CP;
    } catch {
      return null;
    }

    return null;
  }

  try {
    const chess = new Chess(fen);
    const sideToMoveSign = Math.sign(mate);
    return chess.turn() === "w" ? sideToMoveSign * TERMINAL_MATE_CP : -sideToMoveSign * TERMINAL_MATE_CP;
  } catch {
    return Math.sign(mate) * TERMINAL_MATE_CP;
  }
}

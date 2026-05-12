import { Chess } from "chess.js";

export type NormalizedNote = {
  moveKey: string;
  decisionFen: string;
  moveSan: string | null;
  moveUci: string;
  classification: string | null;
  noteText: string;
  evalBeforeCp: number | null;
  evalAfterCp: number | null;
  moverColor: "white" | "black" | null;
};

function computeSan(fen: string, moveUci: string): string | null {
  if (!fen || !moveUci || moveUci.length < 4) return null;
  try {
    const chess = new Chess(fen);
    const from = moveUci.slice(0, 2);
    const to = moveUci.slice(2, 4);
    const promotion = moveUci.length === 5 ? moveUci[4] : undefined;
    const moveResult = chess.move({ from, to, promotion });
    return moveResult?.san ?? null;
  } catch {
    return null;
  }
}

function moverColorFromFen(fen: string | null | undefined): "white" | "black" | null {
  const turn = fen?.split(/\s+/)[1];
  if (turn === "w") return "white";
  if (turn === "b") return "black";
  return null;
}

export type RawNoteRow = {
  move_key?: string | null;
  decision_fen?: string | null;
  move_uci?: string | null;
  move_san?: string | null;
  classification?: string | null;
  note_text?: string | null;
  note?: string | null;
  eval_before_cp?: number | null;
  eval_after_cp?: number | null;
};

export function normalizeNote(row: RawNoteRow): NormalizedNote {
  const fen = row.decision_fen ?? "";
  const uci = row.move_uci ?? "";
  let san = row.move_san ?? null;
  if (!san && fen && uci) {
    san = computeSan(fen, uci);
  }
  return {
    moveKey: row.move_key ?? `${fen}::${uci}`,
    decisionFen: fen,
    moveSan: san,
    moveUci: uci,
    classification: row.classification ?? null,
    noteText: row.note_text ?? row.note ?? "",
    evalBeforeCp: row.eval_before_cp ?? null,
    evalAfterCp: row.eval_after_cp ?? null,
    moverColor: moverColorFromFen(fen),
  };
}

export function normalizeNotes(rows: RawNoteRow[]): NormalizedNote[] {
  return rows
    .map(normalizeNote)
    .filter((n) => Boolean(n.noteText || n.moveSan || n.moveUci));
}

export function formatEvalCp(cp: number | null | undefined): string {
  if (typeof cp !== "number" || Number.isNaN(cp)) return "";
  const pawns = cp / 100;
  if (Math.abs(pawns) < 0.05) return "0.0";
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
}

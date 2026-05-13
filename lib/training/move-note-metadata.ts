import { Chess } from "chess.js";
import { getPositionEval } from "@/lib/engines/dispatcher";
import type { MoveClassification } from "@/lib/move-classification";

export const NOTE_EVAL_TIME_LIMIT_MS = 1000;

export type MoveNoteMetadata = {
  moveSan: string | null;
  classification: MoveClassification | null;
  evalBeforeCp: number | null;
  evalAfterCp: number | null;
};

function classifyByCpLoss(cpLoss: number): MoveClassification {
  if (cpLoss <= 25) return "good";
  if (cpLoss <= 70) return "okay";
  if (cpLoss <= 150) return "inaccuracy";
  if (cpLoss <= 300) return "mistake";
  return "blunder";
}

function moverColorFromFen(fen: string): "white" | "black" | null {
  const turn = fen.split(/\s+/)[1];
  if (turn === "w") return "white";
  if (turn === "b") return "black";
  return null;
}

export function moveNoteMoverColor(fen: string): "white" | "black" | null {
  return moverColorFromFen(fen);
}

export function applyUciToFen(fen: string, uci: string): { fenAfter: string; san: string } | null {
  if (!uci || uci.length < 4) return null;
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? uci[4] : undefined,
    });
    if (!move) return null;
    return { fenAfter: chess.fen(), san: move.san };
  } catch {
    return null;
  }
}

export async function computeMoveNoteMetadata(
  canonicalFen: string,
  moveUci: string,
  timeLimitMs = NOTE_EVAL_TIME_LIMIT_MS,
): Promise<MoveNoteMetadata> {
  const applied = applyUciToFen(canonicalFen, moveUci);
  if (!applied) {
    return { moveSan: null, classification: null, evalBeforeCp: null, evalAfterCp: null };
  }

  try {
    const [evalBefore, evalAfter] = await Promise.all([
      getPositionEval(canonicalFen, { timeLimitMs }),
      getPositionEval(applied.fenAfter, { timeLimitMs }),
    ]);

    const mover = moverColorFromFen(canonicalFen);
    const evalBeforeCp = Math.round(Number(evalBefore.cp) || 0);
    const evalAfterCp = Math.round(Number(evalAfter.cp) || 0);
    const comparableBefore = mover === "black" ? -evalBeforeCp : evalBeforeCp;
    const comparableAfter = mover === "black" ? -evalAfterCp : evalAfterCp;
    const cpLoss = Math.max(0, comparableBefore - comparableAfter);

    return {
      moveSan: applied.san,
      classification: classifyByCpLoss(cpLoss),
      evalBeforeCp,
      evalAfterCp,
    };
  } catch (err) {
    console.warn("[move-note-metadata] eval failed, saving note without metadata", err);
    return {
      moveSan: applied.san,
      classification: null,
      evalBeforeCp: null,
      evalAfterCp: null,
    };
  }
}

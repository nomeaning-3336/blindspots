import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { normalizeDecisionFen, buildMoveKey } from "@/lib/training/mistake-memory";
import { getPositionEval } from "@/lib/engines/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVAL_TIME_LIMIT_MS = 1000;

type Classification = "good" | "okay" | "inaccuracy" | "mistake" | "blunder";

function classifyByCpLoss(cpLoss: number): Classification {
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

function applyUciToFen(fen: string, uci: string): { fenAfter: string; san: string } | null {
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

async function computeNoteMetadata(canonicalFen: string, moveUci: string): Promise<{
  moveSan: string | null;
  classification: Classification | null;
  evalBeforeCp: number | null;
  evalAfterCp: number | null;
}> {
  const applied = applyUciToFen(canonicalFen, moveUci);
  if (!applied) {
    return { moveSan: null, classification: null, evalBeforeCp: null, evalAfterCp: null };
  }

  try {
    const [evalBefore, evalAfter] = await Promise.all([
      getPositionEval(canonicalFen, { timeLimitMs: EVAL_TIME_LIMIT_MS }),
      getPositionEval(applied.fenAfter, { timeLimitMs: EVAL_TIME_LIMIT_MS }),
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
    console.warn("[notes/upsert] eval failed, saving note without metadata", err);
    return {
      moveSan: applied.san,
      classification: null,
      evalBeforeCp: null,
      evalAfterCp: null,
    };
  }
}

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as {
    decisionFen?: unknown;
    moveUci?: unknown;
    noteText?: unknown;
  } | null;

  const decisionFen = typeof payload?.decisionFen === "string" ? payload.decisionFen : "";
  const moveUci = typeof payload?.moveUci === "string" ? payload.moveUci : "";
  const noteText = typeof payload?.noteText === "string" ? payload.noteText : "";

  if (!decisionFen || !moveUci) {
    return NextResponse.json({ error: "Missing decisionFen or moveUci" }, { status: 400 });
  }

  const canonicalFen = normalizeDecisionFen(decisionFen);
  const moveKey = buildMoveKey(canonicalFen, moveUci);
  const metadata = await computeNoteMetadata(canonicalFen, moveUci);

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("training_move_notes" as any).upsert(
    {
      user_id: userId,
      move_key: moveKey,
      decision_fen: canonicalFen,
      move_uci: moveUci,
      move_san: metadata.moveSan,
      note_text: noteText,
      classification: metadata.classification,
      eval_before_cp: metadata.evalBeforeCp,
      eval_after_cp: metadata.evalAfterCp,
    },
    { onConflict: "user_id, move_key" },
  );

  if (error) {
    return NextResponse.json({ error: `Save failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    moveKey,
    moveSan: metadata.moveSan,
    classification: metadata.classification,
    evalBeforeCp: metadata.evalBeforeCp,
    evalAfterCp: metadata.evalAfterCp,
    moverColor: moverColorFromFen(canonicalFen),
  });
}

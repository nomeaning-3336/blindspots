import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { normalizeDecisionFen, buildMoveKey } from "@/lib/training/mistake-memory";
import { computeMoveNoteMetadata, moveNoteMoverColor } from "@/lib/training/move-note-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const metadata = await computeMoveNoteMetadata(canonicalFen, moveUci);

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
    moverColor: moveNoteMoverColor(canonicalFen),
  });
}

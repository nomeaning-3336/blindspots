import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { buildMoveKey, normalizeDecisionFen } from "@/lib/training/mistake-memory";
import { computeMoveNoteMetadata, moveNoteMoverColor } from "@/lib/training/move-note-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpsertNotePayload = {
  moveKey?: unknown;
  decisionFen?: unknown;
  moveUci?: unknown;
  moveSan?: unknown;
  noteText?: unknown;
  classification?: unknown;
  cpLoss?: unknown;
  evalBeforeCp?: unknown;
  evalAfterCp?: unknown;
  mateBefore?: unknown;
  mateAfter?: unknown;
  attemptCount?: unknown;
};

type QueryParams = {
  decisionFen?: string;
};

export async function POST(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as UpsertNotePayload | null;
  if (!payload?.decisionFen || !payload?.moveUci) {
    return NextResponse.json({ error: "Missing required fields: decisionFen, moveUci" }, { status: 400 });
  }

  const decisionFen = typeof payload.decisionFen === "string" ? payload.decisionFen : "";
  const moveUci = typeof payload.moveUci === "string" ? payload.moveUci : "";
  if (!decisionFen || !moveUci) {
    return NextResponse.json({ error: "Missing required fields: decisionFen, moveUci" }, { status: 400 });
  }

  const canonicalFen = normalizeDecisionFen(decisionFen);
  const moveKey = typeof payload.moveKey === "string" && payload.moveKey
    ? payload.moveKey
    : buildMoveKey(canonicalFen, moveUci);
  const noteText = typeof payload.noteText === "string" ? payload.noteText : "";
  const metadata = await computeMoveNoteMetadata(canonicalFen, moveUci);
  const moveSan = metadata.moveSan ?? (typeof payload.moveSan === "string" ? payload.moveSan : null);

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("training_move_notes" as any).upsert(
    {
      user_id: userId,
      move_key: moveKey,
      decision_fen: canonicalFen,
      move_uci: moveUci,
      move_san: moveSan,
      note_text: noteText,
      classification: metadata.classification,
      cp_loss: typeof payload.cpLoss === "number" ? payload.cpLoss : null,
      eval_before_cp: metadata.evalBeforeCp,
      eval_after_cp: metadata.evalAfterCp,
      mate_before: typeof payload.mateBefore === "number" ? payload.mateBefore : null,
      mate_after: typeof payload.mateAfter === "number" ? payload.mateAfter : null,
      attempt_count: typeof payload.attemptCount === "number" ? payload.attemptCount : 1,
    },
    { onConflict: "user_id, move_key" },
  );

  if (error) {
    return NextResponse.json(
      { error: `Failed to save move note: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    moveKey,
    moveSan,
    classification: metadata.classification,
    evalBeforeCp: metadata.evalBeforeCp,
    evalAfterCp: metadata.evalAfterCp,
    moverColor: moveNoteMoverColor(canonicalFen),
  });
}

export async function DELETE(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as { moveKey?: unknown } | null;
  if (!payload?.moveKey || typeof payload.moveKey !== "string") {
    return NextResponse.json({ error: "Missing required field: moveKey" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("training_move_notes" as any)
    .delete()
    .eq("user_id", userId)
    .eq("move_key", payload.moveKey);

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete move note: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const userId = await getOptionalAppUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const decisionFen = url.searchParams.get("decisionFen");

  const supabase = getSupabaseAdminClient();
  let query = (supabase.from("training_move_notes" as any) as any)
    .select("*")
    .eq("user_id", userId);

  if (decisionFen) {
    const canonicalFen = normalizeDecisionFen(decisionFen);
    query = query.in("decision_fen", Array.from(new Set([canonicalFen, decisionFen])));
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: `Failed to load move notes: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ notes: data ?? [] });
}

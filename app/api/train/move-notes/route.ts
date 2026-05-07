import { NextResponse } from "next/server";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

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
  if (!payload?.moveKey || !payload?.decisionFen || !payload?.moveUci) {
    return NextResponse.json({ error: "Missing required fields: moveKey, decisionFen, moveUci" }, { status: 400 });
  }

  const noteText = typeof payload.noteText === "string" ? payload.noteText : "";
  const moveSan = typeof payload.moveSan === "string" ? payload.moveSan : null;
  const classification = typeof payload.classification === "string" ? payload.classification : null;

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("training_move_notes" as any).upsert(
    {
      user_id: userId,
      move_key: payload.moveKey,
      decision_fen: payload.decisionFen,
      move_uci: payload.moveUci,
      move_san: moveSan,
      note_text: noteText,
      classification,
      cp_loss: typeof payload.cpLoss === "number" ? payload.cpLoss : null,
      eval_before_cp: typeof payload.evalBeforeCp === "number" ? payload.evalBeforeCp : null,
      eval_after_cp: typeof payload.evalAfterCp === "number" ? payload.evalAfterCp : null,
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
    query = query.eq("decision_fen", decisionFen);
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
